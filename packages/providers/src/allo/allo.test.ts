import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ChannelRef } from '@opensequence/core';
import { StaticCredentials } from '../credentials.js';
import { signStandardWebhook } from '../standard-webhooks.js';
import { AlloSmsProvider } from './sms.js';
import { AlloDialerProvider } from './dialer.js';
import { alloProbe, alloRegisterWebhook } from './probe.js';
import { AlloApiError } from './client.js';

const BASE = 'https://allo.test';
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const credentials = new StaticCredentials({ prj_1: { allo: { api_key: 'allo-key', webhook_secret: 'whsec_c2VjcmV0' } } });
const channel: ChannelRef = { projectId: 'prj_1', senderId: 'snd_1', channelId: 'chn_sms', address: '+15550000001', config: { allo_user_id: 'usr-abc' } };
const sms = () => new AlloSmsProvider(credentials, { baseUrl: BASE });
const dialer = () => new AlloDialerProvider(credentials, { baseUrl: BASE });

// A base64 secret; Allo issues `whsec_<base64>`.
const SECRET = 'whsec_' + Buffer.from('a-signing-secret').toString('base64');

function signed(body: unknown, opts: { id?: string; timestamp?: number; secret?: string } = {}) {
  const raw = Buffer.from(JSON.stringify(body));
  const id = opts.id ?? 'wh_1';
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const signature = signStandardWebhook({ id, timestamp, body: raw, secret: opts.secret ?? SECRET });
  return { rawBody: raw, headers: { 'webhook-id': id, 'webhook-timestamp': String(timestamp), 'webhook-signature': signature } };
}

describe('AlloSmsProvider.send', () => {
  it('posts {from, to, message} with the raw key and returns no provider id', async () => {
    let seen: { auth: string | null; body: unknown } | undefined;
    server.use(
      http.post(`${BASE}/v1/api/sms`, async ({ request }) => {
        seen = { auth: request.headers.get('authorization'), body: await request.json() };
        return HttpResponse.json({ data: { from_number: '+15550000001', to_number: '+15551234567', type: 'OUTBOUND', content: 'Hey', start_date: '2026-10-13T10:00:00Z' } });
      }),
    );
    const res = await sms().send({ channel, to: '+15551234567', body: 'Hey', idempotencyKey: 'run_1' });
    expect(res).toEqual({ providerId: null });
    expect(seen).toEqual({ auth: 'allo-key', body: { from: '+15550000001', to: '+15551234567', message: 'Hey' } });
  });

  it('throws an error whose message starts with the documented code', async () => {
    server.use(http.post(`${BASE}/v1/api/sms`, () => HttpResponse.json({ error: { code: 'TO_NUMBER_COUNTRY_MISMATCH', message: 'Recipient must be in the same country as the sender' } }, { status: 400 })));
    const err = await sms()
      .send({ channel, to: '+33612345678', body: 'Hey', idempotencyKey: 'run_2' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AlloApiError);
    expect((err as AlloApiError).code).toBe('TO_NUMBER_COUNTRY_MISMATCH');
    expect((err as Error).message).toMatch(/^TO_NUMBER_COUNTRY_MISMATCH: /);
  });

  it('reads reset_in from a daily quota 429', async () => {
    server.use(http.post(`${BASE}/v1/api/sms`, () => HttpResponse.json({ error: { code: 'API_KEY_QUOTA_EXCEEDED', message: 'limit=500;type=DAILY;reset_in=3600' } }, { status: 429 })));
    const err = (await sms()
      .send({ channel, to: '+15551234567', body: 'Hey', idempotencyKey: 'run_3' })
      .catch((e: unknown) => e)) as AlloApiError;
    expect(err.code).toBe('API_KEY_QUOTA_EXCEEDED');
    expect(err.retryAfterSeconds).toBe(3600);
  });
});

describe('AlloSmsProvider.findSent', () => {
  it('searches outbound SMS to the number and returns the newest item with the same content', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${BASE}/v2/api/conversations/items/search`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          data: [
            { id: 'msg_old', type: 'SMS', direction: 'OUTBOUND', content: 'Hey', sent_at: '2026-10-13T09:00:00Z' },
            { id: 'msg_new', type: 'SMS', direction: 'OUTBOUND', content: 'Hey', sent_at: '2026-10-13T10:05:00Z' },
            { id: 'msg_other', type: 'SMS', direction: 'OUTBOUND', content: 'Different', sent_at: '2026-10-13T10:06:00Z' },
          ],
          pagination: { total_count: 3 },
        });
      }),
    );
    const since = new Date('2026-10-13T09:55:00Z');
    expect(await sms().findSent({ channel, to: '+15551234567', body: 'Hey', since })).toEqual({ providerId: 'msg_new' });
    expect(body).toMatchObject({ contact_number: '+15551234567', type: 'SMS', direction: 'OUTBOUND', date: { from: '2026-10-13' }, sort: 'DATE_DESC' });
  });

  it('returns null when nothing matches', async () => {
    server.use(http.post(`${BASE}/v2/api/conversations/items/search`, () => HttpResponse.json({ data: [] })));
    expect(await sms().findSent({ channel, to: '+15551234567', body: 'Hey', since: new Date() })).toBeNull();
  });
});

describe('AlloSmsProvider.verifyWebhook', () => {
  const envelope = (topic: string, data: Record<string, unknown>) => ({ topic, version: '2.0', timestamp: '2026-10-13T10:00:00Z', data });

  it('accepts a correctly signed body and maps sms.received to a reply', async () => {
    const req = signed(envelope('sms.received', { id: 'msg_1', direction: 'INBOUND', type: 'SMS', content: 'Sounds good', sent_at: '2026-10-13T10:00:01Z', from_number: '+15551234567', to_number: '+15550000001' }));
    const events = await sms().verifyWebhook({ projectId: 'prj_1', ...req, secret: SECRET });
    expect(events).toEqual([{ kind: 'reply', channel: 'sms', externalId: 'wh_1', occurredAt: new Date('2026-10-13T10:00:01Z'), from: '+15551234567', to: '+15550000001', body: 'Sounds good' }]);
  });

  it('accepts a rotated signature list where one entry matches', async () => {
    const req = signed(envelope('sms.received', { content: 'ok', from_number: '+1', to_number: '+2' }));
    req.headers['webhook-signature'] = `v1,AAAA ${req.headers['webhook-signature']}`;
    await expect(sms().verifyWebhook({ projectId: 'prj_1', ...req, secret: SECRET })).resolves.toHaveLength(1);
  });

  it('rejects a bad signature', async () => {
    const req = signed(envelope('sms.received', { content: 'ok' }), { secret: 'whsec_' + Buffer.from('wrong').toString('base64') });
    await expect(sms().verifyWebhook({ projectId: 'prj_1', ...req, secret: SECRET })).rejects.toThrow(/WEBHOOK_SIGNATURE_INVALID/);
  });

  it('rejects an old timestamp', async () => {
    const req = signed(envelope('sms.received', { content: 'ok' }), { timestamp: Math.floor(Date.now() / 1000) - 600 });
    await expect(sms().verifyWebhook({ projectId: 'prj_1', ...req, secret: SECRET })).rejects.toThrow(/tolerance/);
  });

  it('maps STOP words to opt_out', async () => {
    for (const word of ['STOP', ' stop ', 'Unsubscribe', 'opt out', 'STOPALL']) {
      const req = signed(envelope('sms.received', { content: word, sent_at: '2026-10-13T10:00:01Z', from_number: '+15551234567', to_number: '+15550000001' }));
      const [event] = await sms().verifyWebhook({ projectId: 'prj_1', ...req, secret: SECRET });
      expect(event, word).toEqual({ kind: 'opt_out', channel: 'sms', externalId: 'wh_1', occurredAt: new Date('2026-10-13T10:00:01Z'), from: '+15551234567', to: '+15550000001' });
    }
  });

  it('maps sms.sent carrying the message id as externalId', async () => {
    const req = signed(envelope('sms.sent', { id: 'msg_9', direction: 'OUTBOUND', content: 'Hey', sent_at: '2026-10-13T10:00:02Z', from_number: '+15550000001', to_number: '+15551234567' }));
    expect(await sms().verifyWebhook({ projectId: 'prj_1', ...req, secret: SECRET })).toEqual([
      { kind: 'sent', channel: 'sms', externalId: 'msg_9', occurredAt: new Date('2026-10-13T10:00:02Z'), from: '+15550000001', to: '+15551234567', body: 'Hey' },
    ]);
  });

  it('maps call.completed', async () => {
    const req = signed(
      envelope('call.completed', {
        id: 'cll_1',
        start_date: '2026-10-13T10:00:03Z',
        type: 'OUTBOUND',
        from_number: '+15550000001',
        to: '+15551234567',
        result: 'VOICEMAIL',
        length_in_minutes: 1.5,
        summary: 'Left a message',
        user_email: 'rep@example.com',
      }),
    );
    expect(await sms().verifyWebhook({ projectId: 'prj_1', ...req, secret: SECRET })).toEqual([
      {
        kind: 'call_completed',
        externalId: 'cll_1',
        occurredAt: new Date('2026-10-13T10:00:03Z'),
        from: '+15550000001',
        to: '+15551234567',
        direction: 'outbound',
        result: 'VOICEMAIL',
        userEmail: 'rep@example.com',
        summary: 'Left a message',
        durationMinutes: 1.5,
      },
    ]);
  });

  it('ignores unknown topics', async () => {
    const req = signed(envelope('tag.added', { id: 't' }));
    expect(await sms().verifyWebhook({ projectId: 'prj_1', ...req, secret: SECRET })).toEqual([]);
  });
});

describe('AlloSmsProvider pickers and health', () => {
  it('lists numbers and users', async () => {
    server.use(
      http.get(`${BASE}/v2/api/numbers`, () =>
        HttpResponse.json({
          data: [
            { number: '+15550000001', name: 'Main', country: 'US', type: 'LOCAL', capabilities: ['VOICE', 'SMS'], users: [{ id: 'usr-abc', name: 'Rep', email: 'rep@example.com' }] },
            { number: null, name: 'Allo', country: 'FR', type: 'SENDER_ID', capabilities: ['SMS'], users: [] },
          ],
        }),
      ),
      http.get(`${BASE}/v2/api/users`, () => HttpResponse.json({ data: [{ id: 'usr-abc', name: 'Rep', email: 'rep@example.com', role: 'ADMIN', status: 'ACTIVE' }] })),
    );
    expect(await sms().listNumbers('prj_1')).toEqual([
      { address: '+15550000001', ref: '+15550000001', country: 'US', capabilities: ['VOICE', 'SMS'], users: [{ id: 'usr-abc', email: 'rep@example.com', name: 'Rep' }], name: 'Main' },
    ]);
    expect(await sms().listUsers('prj_1')).toEqual([{ id: 'usr-abc', email: 'rep@example.com', name: 'Rep' }]);
  });

  it('reports health from /me', async () => {
    server.use(http.get(`${BASE}/v2/api/me`, () => HttpResponse.json({ data: { scopes: ['SMS_SEND', 'USERS_READ'] } })));
    expect(await sms().health(channel)).toBe('active');
    server.use(http.get(`${BASE}/v2/api/me`, () => HttpResponse.json({ data: { scopes: ['USERS_READ'] } })));
    expect(await sms().health(channel)).toBe('restricted');
    server.use(http.get(`${BASE}/v2/api/me`, () => HttpResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })));
    expect(await sms().health(channel)).toBe('credentials_needed');
    expect(await sms().health({ ...channel, projectId: 'prj_none' })).toBe('credentials_needed');
  });
});

describe('alloProbe and alloRegisterWebhook', () => {
  it('names the missing scopes', async () => {
    server.use(http.get(`${BASE}/v2/api/me`, () => HttpResponse.json({ data: { scopes: ['SMS_SEND', 'DIALING_QUEUE_READ_WRITE', 'PHONE_NUMBERS_READ', 'USERS_READ'], team: { id: 'team_1' } } })));
    expect(await alloProbe('k', { baseUrl: BASE })).toEqual({ ok: false, scopes: ['SMS_SEND', 'DIALING_QUEUE_READ_WRITE', 'PHONE_NUMBERS_READ', 'USERS_READ'], missing: ['WEBHOOKS_READ_WRITE', 'CONVERSATIONS_READ'], teamId: 'team_1' });
    server.use(http.get(`${BASE}/v2/api/me`, () => HttpResponse.json({}, { status: 401 })));
    expect((await alloProbe('bad', { baseUrl: BASE })).ok).toBe(false);
  });

  it('registers a webhook and returns the signing secret', async () => {
    let body: unknown;
    server.use(
      http.post(`${BASE}/v2/api/webhooks`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { id: 'whk_1', signing_secret: 'whsec_abc' } }, { status: 201 });
      }),
    );
    expect(await alloRegisterWebhook('k', 'https://seq.example/hooks/allo/acme', undefined, { baseUrl: BASE })).toEqual({ id: 'whk_1', signingSecret: 'whsec_abc' });
    expect(body).toEqual({ url: 'https://seq.example/hooks/allo/acme', topics: ['sms.received', 'sms.sent', 'call.completed'], description: 'OpenSequence' });
  });
});

describe('AlloDialerProvider', () => {
  it('pushes numbers with the sender user id and maps added/skipped', async () => {
    let body: unknown;
    server.use(
      http.post(`${BASE}/v2/api/dialing-queues/current/numbers`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { added: [{ number: '+15551234567' }], skipped: [{ number: '+1', reason: 'INVALID_PHONE_NUMBER' }] } });
      }),
    );
    const res = await dialer().pushNumbers({ channel, numbers: [{ number: '+15551234567', name: 'Ada', lastName: 'Lovelace', company: 'Acme', emails: ['ada@acme.com'], jobTitle: 'CTO' }, { number: '+1' }], idempotencyKey: 'task_1' });
    expect(res).toEqual({ added: 1, skipped: [{ number: '+1', reason: 'INVALID_PHONE_NUMBER' }] });
    expect(body).toEqual({ numbers: [{ number: '+15551234567', name: 'Ada', last_name: 'Lovelace', company: 'Acme', emails: ['ada@acme.com'], job_title: 'CTO' }, { number: '+1' }], user_id: 'usr-abc' });
  });

  it('treats a duplicate conflict as added', async () => {
    server.use(http.post(`${BASE}/v2/api/dialing-queues/current/numbers`, () => HttpResponse.json({ error: { code: 'DIALING_QUEUE_APPEND_CONFLICT', message: 'already queued' } }, { status: 409 })));
    expect(await dialer().pushNumbers({ channel, numbers: [{ number: '+15551234567' }], idempotencyKey: 'task_1' })).toEqual({ added: 1, skipped: [] });
  });

  it('reads the queue state', async () => {
    server.use(
      http.get(`${BASE}/v2/api/dialing-queues/current`, ({ request }) => {
        expect(new URL(request.url).searchParams.get('user_id')).toBe('usr-abc');
        return HttpResponse.json({
          data: {
            numbers: [
              { number_to: '+15551234567', call_id: 'cll_1', call_status: 'NO_ANSWER', not_reached_destination_reason: 'NO_ANSWER' },
              { number_to: '+15557654321', call_id: null, call_status: 'QUEUED' },
            ],
          },
        });
      }),
    );
    expect(await dialer().queueState({ channel })).toEqual([
      { number: '+15551234567', callId: 'cll_1', status: 'NO_ANSWER', reason: 'NO_ANSWER' },
      { number: '+15557654321', callId: null, status: 'QUEUED' },
    ]);
    server.use(http.get(`${BASE}/v2/api/dialing-queues/current`, () => HttpResponse.json({ error: { code: 'DIALING_QUEUE_NOT_FOUND' } }, { status: 404 })));
    expect(await dialer().queueState({ channel })).toEqual([]);
  });
});
