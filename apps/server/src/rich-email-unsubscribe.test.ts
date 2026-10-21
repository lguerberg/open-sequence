/**
 * Branded HTML emails and integrator-hosted unsubscribes, end to end through the real HTTP app with
 * mock providers and the real workers: a signature with a base64 logo, an html email whose embedded
 * images reach the provider as inline parts, the `unsubscribe_url` project setting in the body and
 * the List-Unsubscribe headers, and GET/POST /v1/unsubscribes/{token}.
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
const PUBLIC = 'http://127.0.0.1:8099';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const LOGO = `<img src="data:image/png;base64,${PNG}" alt="Acme" width="120" height="40" style="display:block">`;

const htmlBody = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7"><tr><td align="center">
  <table role="presentation" width="600" style="background:#ffffff;border-radius:8px"><tr><td style="padding:24px">${LOGO}</td></tr>
  <tr><td style="padding:0 24px;font-family:Arial,sans-serif;color:#333">Hi {{ contact.first_name | "there" }},<br>Your workspace is ready.</td></tr>
  <tr><td style="padding:24px"><img src="https://cdn.acme.test/hero.png" alt="Hero" width="552"></td></tr>
  <tr><td style="padding:24px">{{ sender.signature }}</td></tr>
  <tr><td style="padding:24px;font-size:12px"><a href="{{ unsubscribe_url }}">Unsubscribe</a></td></tr></table></td></tr></table>`;

const definitionWith = (body: string) => ({
  schema_version: 1,
  entry: 'start',
  settings: { reenroll: 'never' },
  exit_on: ['reply'],
  nodes: {
    start: { type: 'start', next: { then: 'email' } },
    email: { type: 'outreach', channel: 'email', action: 'send', params: { subject: 'Welcome', body, format: 'html' }, next: { sent: 'wait', skipped: 'end', failed: 'end' } },
    wait: { type: 'wait', params: { duration: '30d' }, next: { then: 'end' } },
    end: { type: 'end' },
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- response bodies are asserted field by field below
type Json = Record<string, any>;

describe('rich html emails and integrator-hosted unsubscribes', () => {
  let rt: Runtime;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let scheduler: SchedulerHandle;
  const consumers: ConsumerHandle[] = [];

  beforeAll(async () => {
    const env = loadEnv({
      SEQ_DB_DSN: TEST_DSN,
      SEQ_ENCRYPTION_KEYS: `kb:${Buffer.alloc(32, 2).toString('base64')}`,
      SEQ_ADMIN_TOKEN: ADMIN,
      SEQ_PUBLIC_URL: PUBLIC,
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

  const call = async (method: 'GET' | 'POST' | 'PUT', url: string, opts: { key?: string; body?: unknown; json?: boolean } = {}) => {
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
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`timed out waiting for ${what}`);
  };

  /** A project with a sender (branded signature, mailbox) and a published html sequence. */
  const setup = async (body = htmlBody) => {
    const slug = `rich${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const created = await call('POST', '/v1/admin/projects', { key: ADMIN, body: { slug, name: 'Acme' } });
    const key = created.json.data.api_key as string;
    const projectId = created.json.data.project.id as string;
    const sig = `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="padding-right:12px;border-right:2px solid #0a66c2">${LOGO}</td><td style="padding-left:12px;color:#333"><strong>Max Rivera</strong><br><a href="https://cal.acme.test/max" onclick="x()">Book a call</a></td></tr></table><script>alert(1)</script>`;
    const sender = await call('PUT', '/v1/senders/u_42', { key, body: { name: 'Max Rivera', email: 'max@acme.com', signature_html: sig } });
    expect(sender.status, JSON.stringify(sender.json)).toBe(200);
    const mailbox = (host: string, port: number) => ({ host, port, secure: true, user: 'max@acme.com', password: 'app-password' });
    await call('PUT', '/v1/senders/u_42/channels/email', { key, body: { provider: 'smtp', smtp: mailbox('smtp.example.com', 465), imap: mailbox('imap.example.com', 993) } });
    const seq = await call('POST', '/v1/sequences', { key, body: { name: 'Welcome' } });
    const seqId = seq.json.data.sequence.id as string;
    const verId = seq.json.data.version.id as string;
    const draft = await call('PUT', `/v1/sequences/${seqId}/versions/${verId}/draft`, { key, body: { definition: definitionWith(body), lock_version: 0 } });
    expect(draft.status, JSON.stringify(draft.json)).toBe(200);
    expect((await call('POST', `/v1/sequences/${seqId}/versions/${verId}/publish`, { key, json: true })).status).toBe(200);
    return { key, projectId, seqId, sender: sender.json.data as Json };
  };

  const enrollAndSend = async (key: string, seqId: string, contactId: string, email: string) => {
    expect((await call('PUT', `/v1/contacts/${contactId}`, { key, body: { first_name: 'Erin', email } })).status).toBe(200);
    const enrolled = await call('POST', `/v1/sequences/${seqId}/enrollments`, { key, body: { contacts: [contactId], sender: 'u_42' } });
    expect(enrolled.status, JSON.stringify(enrolled.json)).toBe(201);
    const enrId = enrolled.json.data.enrollments[0].id as string;
    const journey = async () => (await call('GET', `/v1/enrollments/${enrId}`, { key })).json.data as Json;
    await until(async () => (await journey()).runs.some((r: Json) => r.nodeId === 'email' && ['done', 'failed'].includes(r.status)), 'the email step');
    return { enrId, journey, outbox: rt.mock!.outbox.filter((m) => m.kind === 'email' && m.to === email) };
  };

  it('sanitizes a branded signature on save and keeps its base64 logo', async () => {
    const { sender } = await setup();
    expect(sender.signatureHtml).toContain(`src="data:image/png;base64,${PNG}"`);
    expect(sender.signatureHtml).toContain('style="padding-right:12px;border-right:2px solid #0a66c2"');
    expect(sender.signatureHtml).not.toMatch(/script|onclick/);
    expect(sender.signatureText).toBe('[Acme] Max Rivera\nBook a call (https://cal.acme.test/max)');
  });

  it('sends embedded images as inline parts and points unsubscribe at the hosted page by default', async () => {
    const { key, seqId } = await setup();
    const { outbox, journey } = await enrollAndSend(key, seqId, 'p_default', 'dana@example.com');
    expect(outbox).toHaveLength(1);
    const sent = outbox[0]!;
    // The logo appears in the body and in the signature: one inline part, referenced twice.
    expect(sent.inlineImages?.map((i) => [i.contentType, i.base64])).toEqual([['image/png', PNG]]);
    const cid = sent.inlineImages![0]!.contentId;
    expect(sent.html!.match(new RegExp(`src="cid:${cid.replace(/\./g, '\\.')}"`, 'g'))).toHaveLength(2);
    expect(sent.html).not.toContain('base64');
    expect(sent.html).toContain('<img src="https://cdn.acme.test/hero.png" alt="Hero" width="552">');
    expect(sent.body).toContain('[Acme]');
    expect(sent.body).toContain('[Hero]');
    expect(sent.body).not.toContain('<');
    expect(sent.headers!['List-Unsubscribe']).toMatch(new RegExp(`^<${PUBLIC}/u/[\\w-]+\\.[\\w-]+>$`));
    expect(sent.headers!['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(sent.html).toContain(`href="${PUBLIC}/u/`);
    // The stored copy is the HTML as sent, without the base64.
    const j = await journey();
    expect(j.messages[0].body).toContain(`cid:${cid}`);
    expect(j.messages[0].body).not.toContain('base64');
  });

  it('validates the unsubscribe_url setting', async () => {
    const { key } = await setup();
    const http = await call('PUT', '/v1/project/settings', { key, body: { unsubscribe_url: 'http://app.acme.test/u/{token}' } });
    expect(http.status).toBe(422);
    expect(http.json.error.message).toContain('https');
    const noToken = await call('PUT', '/v1/project/settings', { key, body: { unsubscribe_url: 'https://app.acme.test/unsubscribe' } });
    expect(noToken.status).toBe(422);
    expect(noToken.json.error.message).toContain('{token}');
    const good = await call('PUT', '/v1/project/settings', { key, body: { unsubscribe_url: 'https://app.acme.test/u/{token}' } });
    expect(good.status).toBe(200);
    expect(good.json.data.settings.unsubscribe_url).toBe('https://app.acme.test/u/{token}');
    const cleared = await call('PUT', '/v1/project/settings', { key, body: { unsubscribe_url: null } });
    expect(cleared.json.data.settings.unsubscribe_url).toBeNull();
  });

  it("renders the integrator's unsubscribe_url in the body and both headers, and GET/POST /v1/unsubscribes apply it once", async () => {
    const { key, projectId, seqId } = await setup();
    await call('PUT', '/v1/project/settings', { key, body: { unsubscribe_url: 'https://app.acme.test/u/{token}' } });
    const { outbox, journey } = await enrollAndSend(key, seqId, 'p_erin', 'erin@example.com');
    const sent = outbox[0]!;
    const m = /^<https:\/\/app\.acme\.test\/u\/([\w-]+\.[\w-]+)>$/.exec(sent.headers!['List-Unsubscribe']!);
    expect(m).toBeTruthy();
    const token = m![1]!;
    expect(sent.headers!['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(sent.html).toContain(`href="https://app.acme.test/u/${token}"`);
    expect(sent.html).not.toContain(PUBLIC);

    // Read without applying.
    const read = await call('GET', `/v1/unsubscribes/${token}`, { key });
    expect(read.status).toBe(200);
    expect(read.json.data).toEqual({ valid: true, expired: false, contact: { email: 'e***@example.com', first_name: 'Erin' }, already_unsubscribed: false });

    // A read key cannot; the scope is enroll.
    const readKey = (await call('POST', '/v1/api-keys', { key, body: { name: 'ro', scopes: ['read'] } })).json.data.api_key as string;
    expect((await call('GET', `/v1/unsubscribes/${token}`, { key: readKey })).status).toBe(403);

    // Apply: suppression now, the enrollment exits with opt_out.
    const applied = await call('POST', `/v1/unsubscribes/${token}`, { key, json: true });
    expect(applied.status, JSON.stringify(applied.json)).toBe(200);
    expect(applied.json.data).toMatchObject({ valid: true, already_unsubscribed: false });
    const contact = await call('GET', '/v1/contacts/p_erin', { key });
    expect(contact.json.data.suppressions.map((s: Json) => [s.channel, s.reason])).toEqual([['email', 'opt_out']]);
    await until(async () => (await journey()).enrollment.status === 'exited', 'the enrollment to exit');
    expect((await journey()).enrollment.exitReason).toBe('opt_out');

    // Idempotent.
    const again = await call('POST', `/v1/unsubscribes/${token}`, { key, json: true });
    expect(again.status).toBe(200);
    expect(again.json.data.already_unsubscribed).toBe(true);
    expect((await call('GET', `/v1/unsubscribes/${token}`, { key })).json.data.already_unsubscribed).toBe(true);
    expect((await call('GET', '/v1/contacts/p_erin', { key })).json.data.suppressions).toHaveLength(1);

    // Expired: authentic, so it still says whose it was, but it cannot be applied.
    const contactId = contact.json.data.id as string;
    const expired = rt.deps.optOutToken({ projectId, contactId, runId: 'run_old', exp: Math.floor(Date.now() / 1000) - 60 });
    expect((await call('GET', `/v1/unsubscribes/${expired}`, { key })).json.data).toMatchObject({ valid: false, expired: true, contact: { email: 'e***@example.com' } });
    const expiredPost = await call('POST', `/v1/unsubscribes/${expired}`, { key, json: true });
    expect(expiredPost.status).toBe(400);
    expect(expiredPost.json.error.code).toBe('UNSUBSCRIBE_TOKEN_EXPIRED');

    // Invalid: garbage, tampered, or another project's token.
    const tampered = `${token.split('.')[0]}x.${token.split('.')[1]}`;
    const other = await setup();
    for (const bad of ['not-a-token', 'abc.def', tampered]) {
      expect((await call('GET', `/v1/unsubscribes/${bad}`, { key })).json.data).toEqual({ valid: false, expired: false, contact: null, already_unsubscribed: false });
      const post = await call('POST', `/v1/unsubscribes/${bad}`, { key, json: true });
      expect(post.status).toBe(400);
      expect(post.json.error.code).toBe('UNSUBSCRIBE_TOKEN_INVALID');
    }
    expect((await call('GET', `/v1/unsubscribes/${token}`, { key: other.key })).json.data.valid).toBe(false);
    expect((await call('POST', `/v1/unsubscribes/${token}`, { key: other.key, json: true })).json.error.code).toBe('UNSUBSCRIBE_TOKEN_INVALID');
  });

  it('the hosted page still works for a project without unsubscribe_url', async () => {
    const { key, seqId } = await setup();
    const { outbox, journey } = await enrollAndSend(key, seqId, 'p_hosted', 'hosted@example.com');
    const url = /^<([^>]+)>$/.exec(outbox[0]!.headers!['List-Unsubscribe']!)![1]!;
    const path = url.slice(PUBLIC.length);
    expect((await app.inject({ method: 'GET', url: path })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: path })).statusCode).toBe(200);
    await until(async () => (await journey()).enrollment.status === 'exited', 'the enrollment to exit');
    expect((await app.inject({ method: 'POST', url: '/u/abc.def' })).statusCode).toBe(400);
  });

  it('fails the step with IMAGE_TOO_LARGE for an embedded image over 1 MB, without sending', async () => {
    const big = Buffer.alloc(1024 * 1024 + 10, 4).toString('base64');
    const { key, seqId } = await setup(`<p>Hi</p><img src="data:image/jpeg;base64,${big}" alt="Big"> {{ unsubscribe_url }}`);
    const { outbox, journey } = await enrollAndSend(key, seqId, 'p_big', 'big@example.com');
    expect(outbox).toHaveLength(0);
    const run = (await journey()).runs.find((r: Json) => r.nodeId === 'email');
    expect(run.status).toBe('failed');
    expect(run.error).toMatch(/^IMAGE_TOO_LARGE: /);
  });

  it('accepts a definition above the old 2 MB request limit', async () => {
    const { key } = await setup();
    const image = Buffer.alloc(900 * 1024, 6).toString('base64');
    const body = `${['a', 'b', 'c'].map((c, i) => `<img alt="${c}" src="data:image/png;base64,${Buffer.alloc(900 * 1024, i + 20).toString('base64')}">`).join('')}<img src="data:image/png;base64,${image}"> {{ unsubscribe_url }}`;
    const definition = definitionWith(body);
    expect(Buffer.byteLength(JSON.stringify(definition))).toBeGreaterThan(4 * 1024 * 1024);
    const r = await call('POST', '/v1/sequences:validate', { key, body: { definition } });
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.json.data.problems.map((p: Json) => p.code)).toContain('HEAVY_EMAIL');
  });
});
