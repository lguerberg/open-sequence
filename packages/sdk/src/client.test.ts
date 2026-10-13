import { describe, expect, test } from 'vitest';
import { OpenSequence, OpenSequenceAdmin, OpenSequenceError, encodeQuery, type FetchLike } from './index.js';
import { fakeFetch } from './test-helpers.test.js';

const BASE = 'https://seq.example.com';

function client(fetch = fakeFetch()) {
  return { fetch, oseq: new OpenSequence({ baseUrl: `${BASE}/`, apiKey: 'sk_live_abc', fetch }) };
}

describe('request headers and URL', () => {
  test('GET sends bearer auth, user-agent and no content-type', async () => {
    const { fetch, oseq } = client();
    fetch.reply([]);
    await oseq.senders.list();
    const call = fetch.last();
    expect(call.method).toBe('GET');
    expect(call.url).toBe(`${BASE}/v1/senders`);
    expect(call.headers['authorization']).toBe('Bearer sk_live_abc');
    expect(call.headers['user-agent']).toMatch(/^opensequence-sdk\/\d+\.\d+\.\d+$/);
    expect(call.headers['accept']).toBe('application/json');
    expect(call.headers['content-type']).toBeUndefined();
    expect(call.body).toBeUndefined();
  });

  test('a body sets content-type and is JSON', async () => {
    const { fetch, oseq } = client();
    fetch.reply({ id: 'snd_1' });
    await oseq.senders.upsert('u 42', { name: 'Max', email: 'max@acme.com' });
    const call = fetch.last();
    expect(call.method).toBe('PUT');
    expect(call.url).toBe(`${BASE}/v1/senders/u%2042`);
    expect(call.headers['content-type']).toBe('application/json');
    expect(JSON.parse(call.body!)).toEqual({ name: 'Max', email: 'max@acme.com' });
  });

  test('a custom user agent and the admin token both go through', async () => {
    const fetch = fakeFetch();
    const admin = new OpenSequenceAdmin({ baseUrl: BASE, adminToken: 'op_secret', fetch, userAgent: 'acme-crm/2.0' });
    fetch.reply({ project: { id: 'prj_1' }, api_key: 'sk_live_new' }, { status: 201 });
    const out = await admin.projects.create({ slug: 'acme', name: 'Acme CRM' });
    expect(out.api_key).toBe('sk_live_new');
    expect(fetch.last().url).toBe(`${BASE}/v1/admin/projects`);
    expect(fetch.last().headers['authorization']).toBe('Bearer op_secret');
    expect(fetch.last().headers['user-agent']).toBe('acme-crm/2.0');
  });

  test('query encoding: dates as ISO, arrays repeated, null and undefined dropped', () => {
    expect(encodeQuery({ limit: 50, cursor: undefined, updated_since: new Date('2026-10-13T10:00:00Z'), status: null, kinds: ['a', 'b'], q: 'a b&c' })).toBe(
      '?limit=50&updated_since=2026-10-13T10%3A00%3A00.000Z&kinds=a&kinds=b&q=a+b%26c',
    );
    expect(encodeQuery(undefined)).toBe('');
    expect(encodeQuery({})).toBe('');
  });

  test('constructor refuses missing options', () => {
    expect(() => new OpenSequence({ baseUrl: '', apiKey: 'x', fetch: fakeFetch() })).toThrow(/baseUrl/);
    expect(() => new OpenSequence({ baseUrl: BASE, apiKey: '', fetch: fakeFetch() })).toThrow(/apiKey/);
  });
});

describe('envelope and errors', () => {
  test('unwraps data', async () => {
    const { fetch, oseq } = client();
    fetch.reply({ id: 'ctc_1', externalId: 'p_7' });
    expect(await oseq.contacts.get('p_7')).toEqual({ id: 'ctc_1', externalId: 'p_7' });
  });

  test('409 ALREADY_IN_SEQUENCE becomes an OpenSequenceError with details and request id', async () => {
    const { fetch, oseq } = client();
    const details = { conflicts: [{ contact_id: 'ctc_1', external_id: 'p_7', sequence_id: 'seq_1', enrollment_id: 'enr_1', status: 'active' }] };
    fetch.fail(409, { code: 'ALREADY_IN_SEQUENCE', message: '1 of the 2 contacts are already in a sequence. Nobody was enrolled.', details }, 'req_409');
    const err = await oseq.sequences.enroll('seq_1', { contacts: ['p_7', 'p_8'], sender: 'u_42' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OpenSequenceError);
    const e = err as OpenSequenceError;
    expect(e.status).toBe(409);
    expect(e.code).toBe('ALREADY_IN_SEQUENCE');
    expect(e.is('ALREADY_IN_SEQUENCE')).toBe(true);
    expect(e.message).toMatch(/Nobody was enrolled/);
    expect(e.details).toEqual(details);
    expect(e.requestId).toBe('req_409');
    expect(e.name).toBe('OpenSequenceError');
  });

  test('a network failure is NETWORK_ERROR with status 0 and the cause', async () => {
    const { fetch, oseq } = client();
    const boom = new Error('ECONNREFUSED');
    fetch.throwNext(boom);
    const err = (await oseq.tasks.list().catch((e: unknown) => e)) as OpenSequenceError;
    expect(err).toBeInstanceOf(OpenSequenceError);
    expect(err.status).toBe(0);
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.message).toContain('ECONNREFUSED');
    expect(err.cause).toBe(boom);
  });

  test('a non-JSON body is INVALID_RESPONSE with the status kept', async () => {
    const { fetch, oseq } = client();
    fetch.reply(null, { status: 502, raw: '<html>Bad gateway</html>' });
    const err = (await oseq.tasks.list().catch((e: unknown) => e)) as OpenSequenceError;
    expect(err).toBeInstanceOf(OpenSequenceError);
    expect(err.status).toBe(502);
    expect(err.code).toBe('INVALID_RESPONSE');
    expect(err.details).toEqual({ body: '<html>Bad gateway</html>' });
  });

  test('a non-2xx JSON body without the envelope is HTTP_<status>', async () => {
    const { fetch, oseq } = client();
    fetch.reply(null, { status: 503, raw: JSON.stringify({ ok: false, reason: 'migrations pending' }) });
    const err = (await oseq.project.get().catch((e: unknown) => e)) as OpenSequenceError;
    expect(err.status).toBe(503);
    expect(err.code).toBe('HTTP_503');
    expect(err.details).toEqual({ ok: false, reason: 'migrations pending' });
  });

  test('a 2xx without the envelope is INVALID_RESPONSE', async () => {
    const { fetch, oseq } = client();
    fetch.reply(null, { raw: JSON.stringify({ id: 'snd_1' }) });
    const err = (await oseq.senders.get('u_42').catch((e: unknown) => e)) as OpenSequenceError;
    expect(err.code).toBe('INVALID_RESPONSE');
    expect(err.status).toBe(200);
  });

  test('a timeout aborts the request and is TIMEOUT', async () => {
    const slow: FetchLike = (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    const oseq = new OpenSequence({ baseUrl: BASE, apiKey: 'k', fetch: slow, timeoutMs: 10 });
    const err = (await oseq.tasks.list().catch((e: unknown) => e)) as OpenSequenceError;
    expect(err.code).toBe('TIMEOUT');
    expect(err.status).toBe(0);
  });
});

describe('pagination', () => {
  test('list returns items and nextCursor from meta', async () => {
    const { fetch, oseq } = client();
    fetch.reply([{ id: 'enr_1' }], { meta: { next_cursor: 'c2' } });
    const page = await oseq.enrollments.list({ sequence: 'seq_1', limit: 1, updated_since: '2026-10-01T00:00:00Z' });
    expect(page).toEqual({ items: [{ id: 'enr_1' }], nextCursor: 'c2' });
    expect(fetch.last().url).toBe(`${BASE}/v1/enrollments?sequence=seq_1&limit=1&updated_since=2026-10-01T00%3A00%3A00Z`);
  });

  test('nextCursor is null on the last page', async () => {
    const { fetch, oseq } = client();
    fetch.reply([], { meta: { next_cursor: null } });
    expect((await oseq.enrollments.list()).nextCursor).toBeNull();
    fetch.reply([]);
    expect((await oseq.enrollments.list()).nextCursor).toBeNull();
  });

  test('paginate walks every page, passing the cursor and keeping the filters', async () => {
    const { fetch, oseq } = client();
    fetch.reply([{ id: 'e1' }, { id: 'e2' }], { meta: { next_cursor: 'p2' } });
    fetch.reply([{ id: 'e3' }], { meta: { next_cursor: 'p3' } });
    fetch.reply([], { meta: { next_cursor: null } });
    const ids: string[] = [];
    for await (const e of oseq.enrollments.listAll({ status: 'active', limit: 2 })) ids.push(e.id);
    expect(ids).toEqual(['e1', 'e2', 'e3']);
    expect(fetch.calls.map((c) => c.url)).toEqual([
      `${BASE}/v1/enrollments?status=active&limit=2`,
      `${BASE}/v1/enrollments?status=active&limit=2&cursor=p2`,
      `${BASE}/v1/enrollments?status=active&limit=2&cursor=p3`,
    ]);
  });

  test('paginate stops when a page has no cursor', async () => {
    const { fetch, oseq } = client();
    fetch.reply([{ id: 't1' }]);
    const items = [];
    for await (const t of oseq.tasks.listAll()) items.push(t);
    expect(items).toHaveLength(1);
    expect(fetch.calls).toHaveLength(1);
  });
});
