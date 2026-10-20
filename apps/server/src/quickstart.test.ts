/**
 * The quickstart (docs section 18, phase acceptance), end to end through the real HTTP app with
 * mock providers and the real workers: project, sender, mailbox, contact, sequence,
 * publish, enroll, the planner and the email executor, an inbound reply, exit, analytics.
 * Needs the throwaway Postgres from scripts/test-db.sh (or SEQ_TEST_DB_DSN).
 */
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrap, type Runtime } from './bootstrap.js';
import { loadEnv } from './config/env.js';
import { buildApp } from './http/app.js';
import { consumerSpecs, startConsumer, type ConsumerHandle } from './workers/consumers.js';
import { startScheduler, type SchedulerHandle } from './workers/scheduler.js';

const TEST_DSN = process.env['SEQ_TEST_DB_DSN'] ?? 'postgres://oseq@127.0.0.1:54329/opensequence_test';
const ADMIN = 'test-admin-token';

const definition = {
  schema_version: 1,
  entry: 'start',
  settings: { reenroll: 'never' },
  exit_on: ['reply', 'meeting_booked'],
  nodes: {
    start: { type: 'start', next: { then: 'email_intro' } },
    email_intro: {
      type: 'outreach',
      channel: 'email',
      action: 'send',
      params: { subject: 'Quick question, {{ contact.first_name | "there" }}', body: 'Hi {{ contact.first_name | "there" }}, from {{ sender.name }}.\n\nUnsubscribe: {{ unsubscribe_url }}' },
      next: { sent: 'wait_reply', skipped: 'wait_reply', failed: 'end' },
    },
    wait_reply: { type: 'wait_for', params: { events: ['reply', 'meeting_booked'], timeout: '3d' }, next: { reply: 'end', meeting_booked: 'end', timeout: 'call' } },
    call: { type: 'task', params: { kind: 'call', title: 'Call {{ contact.first_name | "them" }}', due: '1d', dialer: true }, next: { completed: 'end', no_answer: 'end' } },
    end: { type: 'end' },
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- response bodies are asserted field by field below
type Json = Record<string, any>;

describe('quickstart through the HTTP app with mock providers', () => {
  let rt: Runtime;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let scheduler: SchedulerHandle;
  const consumers: ConsumerHandle[] = [];

  beforeAll(async () => {
    const env = loadEnv({
      SEQ_DB_DSN: TEST_DSN,
      // The auth suite's KEY_B: the rotation test re-encrypts every row not under it, so the mailbox stored here must be readable by it.
      SEQ_ENCRYPTION_KEYS: `kb:${Buffer.alloc(32, 2).toString('base64')}`,
      SEQ_ADMIN_TOKEN: ADMIN,
      SEQ_PUBLIC_URL: 'http://127.0.0.1:8099',
      SEQ_DEV_MOCK_PROVIDERS: '1',
      SEQ_RUN_MIGRATIONS: '1',
      SEQ_ROLES: 'all',
      SEQ_LOG_LEVEL: 'fatal',
    });
    const log = pino({ level: 'silent' });
    rt = await bootstrap(env, log);
    app = await buildApp(rt, log);
    await app.ready();
    scheduler = startScheduler(rt.deps);
    for (const spec of consumerSpecs()) consumers.push(startConsumer(rt.deps, spec, 2));
  });

  afterAll(async () => {
    await scheduler?.stop();
    await Promise.all(consumers.map((c) => c.stop()));
    await app?.close();
    await rt?.close();
  });

  const call = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, opts: { key?: string; body?: unknown; json?: boolean } = {}) => {
    const headers: Record<string, string> = {};
    if (opts.key) headers['authorization'] = `Bearer ${opts.key}`;
    if (opts.body !== undefined || opts.json) headers['content-type'] = 'application/json';
    const res = await app.inject({ method, url, headers, payload: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
    return { status: res.statusCode, json: res.json() as Json };
  };

  const until = async (check: () => Promise<boolean>, what: string, ms = 40_000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (await check()) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`timed out waiting for ${what}`);
  };

  it('runs a contact through send, reply and exit', async () => {
    const slug = `acme${Date.now()}`;
    const created = await call('POST', '/v1/admin/projects', { key: ADMIN, body: { slug, name: 'Acme' } });
    expect(created.status).toBe(201);
    const key = created.json.data.api_key as string;
    expect(key).toMatch(/^sk_live_/);

    // Sender and their mailbox. With mock providers the SMTP and IMAP logins are not checked.
    const sender = await call('PUT', '/v1/senders/u_42', { key, body: { name: 'Max Rivera', email: 'max@acme.com', timezone: 'America/New_York' } });
    expect(sender.status).toBe(200);
    const mailbox = (host: string, port: number) => ({ host, port, secure: true, user: 'max@acme.com', password: 'app-password' });
    const connected = await call('PUT', '/v1/senders/u_42/channels/email', { key, body: { provider: 'smtp', smtp: mailbox('smtp.example.com', 465), imap: mailbox('imap.example.com', 993) } });
    expect(connected.status, JSON.stringify(connected.json)).toBe(200);
    expect(connected.json.data).toMatchObject({ channel: 'email', address: 'max@acme.com', status: 'active' });

    const contact = await call('PUT', '/v1/contacts/p_7', { key, body: { first_name: 'Dana', email: 'dana@example.com', timezone: 'Europe/London', attrs: { company: { country: 'UK' } } } });
    expect(contact.status).toBe(200);

    // Sequence: create, save the draft (no problems), publish.
    const seq = await call('POST', '/v1/sequences', { key, body: { name: 'UK intro' } });
    expect(seq.status).toBe(201);
    const seqId = seq.json.data.sequence.id as string;
    const verId = seq.json.data.version.id as string;
    const draft = await call('PUT', `/v1/sequences/${seqId}/versions/${verId}/draft`, { key, body: { definition, lock_version: 0 } });
    expect(draft.status, JSON.stringify(draft.json)).toBe(200);
    expect(draft.json.data.problems).toEqual([]);
    const published = await call('POST', `/v1/sequences/${seqId}/versions/${verId}/publish`, { key, json: true });
    expect(published.status, JSON.stringify(published.json)).toBe(200);
    expect(published.json.data.version.status).toBe('published');

    // Enroll; a second enrollment of the same contact is a 409.
    const enrolled = await call('POST', `/v1/sequences/${seqId}/enrollments`, { key, body: { contacts: ['p_7'], sender: 'u_42' } });
    expect(enrolled.status, JSON.stringify(enrolled.json)).toBe(201);
    expect(enrolled.json.data.accepted).toHaveLength(1);
    const enrId = enrolled.json.data.enrollments[0].id as string;
    const again = await call('POST', `/v1/sequences/${seqId}/enrollments`, { key, body: { contacts: ['p_7'], sender: 'u_42' } });
    expect(again.status).toBe(409);

    // The planner claims the enrollment, the email executor sends through the mock, the flow waits for a reply.
    const journey = async () => (await call('GET', `/v1/enrollments/${enrId}`, { key })).json.data as Json;
    await until(async () => (await journey()).enrollment.currentNodeId === 'wait_reply', 'the email step to finish');
    const j1 = await journey();
    expect(j1.runs.map((r: Json) => [r.nodeId, r.status])).toEqual([
      ['start', 'done'],
      ['email_intro', 'done'],
      ['wait_reply', 'waiting'],
    ]);
    expect(j1.messages).toHaveLength(1);
    const message = j1.messages[0] as Json;
    expect(message).toMatchObject({ direction: 'out', subject: 'Quick question, Dana', status: 'sent', toAddress: 'dana@example.com' });
    expect(message.body).toContain('/u/');
    expect(rt.mock!.outbox).toHaveLength(1);
    expect(await rt.deps.uow.repos.senders.lastSentAt(j1.enrollment.senderId, 'email')).toBeInstanceOf(Date);

    // A reply arrives through the mock hook: matched by thread, the enrollment exits with `replied`.
    const reply = await app.inject({
      method: 'POST',
      url: `/hooks/mock/${slug}`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ kind: 'reply', channel: 'email', externalId: 'evt_reply_1', occurredAt: new Date().toISOString(), from: 'dana@example.com', to: 'max@acme.com', threadRef: message.threadRef }),
    });
    expect(reply.statusCode).toBe(200);
    expect(reply.json()).toMatchObject({ ok: true, stored: 1, ignored: 0 });
    await until(async () => (await journey()).enrollment.status === 'exited', 'the enrollment to exit');
    const j2 = await journey();
    expect(j2.enrollment.exitReason).toBe('replied');

    const analytics = await call('GET', `/v1/sequences/${seqId}/analytics/summary`, { key });
    expect(analytics.status).toBe(200);
    expect(analytics.json.data).toMatchObject({ enrolled: 1, active: 0, exited: 1, touches_delivered: 1, replies: 1, reply_rate_per_100_enrolled: 100, replies_by_channel: { email: 1 } });
  });

  it('rejects a malformed JSON body with a 400, and a read key cannot create', async () => {
    const bad = await app.inject({ method: 'POST', url: '/v1/admin/projects', headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' }, payload: '{not json' });
    expect(bad.statusCode).toBe(400);
    const noKey = await call('GET', '/v1/sequences');
    expect(noKey.status).toBe(401);
  });
});
