/**
 * `PUT /v1/senders/{id}/channels/email` through the real HTTP app with mock providers: the
 * mailbox probe decides, passwords never come back, readiness follows, and removing the channel
 * or disconnecting Google does what it says. The SMTP adapter itself is proven against GreenMail
 * in packages/providers. Needs the throwaway Postgres from scripts/test-db.sh (or SEQ_TEST_DB_DSN).
 */
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SmtpCredentials, SmtpProbeResult } from '@opensequence/providers';
import { bootstrap, type Runtime } from './bootstrap.js';
import { loadEnv } from './config/env.js';
import { buildApp } from './http/app.js';

const TEST_DSN =
  process.env['SEQ_TEST_DB_DSN'] ?? 'postgres://oseq@127.0.0.1:54329/opensequence_test';
const ADMIN = 'test-admin-token';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- response bodies are asserted field by field below
type Json = Record<string, any>;

const server = (host: string, port: number, password: string) => ({
  host,
  port,
  secure: true,
  user: 'max@fastmail.example',
  password,
});
const body = (smtpPassword = 'smtp-app-password-1', imapPassword = 'imap-app-password-1') => ({
  provider: 'smtp',
  smtp: server('smtp.fastmail.example', 465, smtpPassword),
  imap: server('imap.fastmail.example', 993, imapPassword),
});

describe('SMTP email channel through the HTTP app', () => {
  let rt: Runtime;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let key: string;
  const probed: SmtpCredentials[] = [];
  let answer: SmtpProbeResult = { ok: true };

  beforeAll(async () => {
    const env = loadEnv({
      SEQ_DB_DSN: TEST_DSN,
      // The auth suite's KEY_B: the rotation test re-encrypts every row not under it, so connections stored here must be readable by it.
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
    rt.probeMailbox = async (creds) => {
      probed.push(creds);
      return answer;
    };
    app = await buildApp(rt, log);
    await app.ready();
    const created = await call('POST', '/v1/admin/projects', {
      key: ADMIN,
      body: { slug: `smtp${Date.now()}`, name: 'Acme' },
    });
    key = created.json.data.api_key as string;
  });

  afterAll(async () => {
    await app?.close();
    await rt?.close();
  });

  const call = async (
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    opts: { key?: string; body?: unknown } = {}
  ) => {
    const headers: Record<string, string> = {};
    if (opts.key) headers['authorization'] = `Bearer ${opts.key}`;
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const res = await app.inject({
      method,
      url,
      headers,
      payload: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    return { status: res.statusCode, text: res.body, json: res.json() as Json };
  };

  it('stores a verified mailbox: active email channel, readiness ok, passwords never returned', async () => {
    await call('PUT', '/v1/senders/max', {
      key,
      body: { name: 'Max Rivera', email: 'max@acme.com' },
    });
    answer = { ok: true };
    const put = await call('PUT', '/v1/senders/max/channels/email', { key, body: body() });
    expect(put.status, put.text).toBe(200);
    expect(put.json.data).toMatchObject({
      channel: 'email',
      address: 'max@fastmail.example',
      status: 'active',
      config: { provider: 'smtp', imap_cursor: null },
    });
    expect(put.json.data.connectionId).toMatch(/^con_/);
    expect(put.text).not.toMatch(/app-password/);
    expect(probed.at(-1)).toMatchObject({
      smtp: { host: 'smtp.fastmail.example', password: 'smtp-app-password-1' },
      imap: { host: 'imap.fastmail.example', password: 'imap-app-password-1' },
    });

    const detail = await call('GET', '/v1/senders/max', { key });
    expect(detail.text).not.toMatch(/app-password/);
    expect(detail.json.data.readiness.email).toEqual({ ok: true });
    expect(detail.json.data.connections).toEqual([
      expect.objectContaining({
        provider: 'smtp',
        account: 'max@fastmail.example',
        status: 'active',
        config: {
          smtp: {
            host: 'smtp.fastmail.example',
            port: 465,
            secure: true,
            user: 'max@fastmail.example',
          },
          imap: {
            host: 'imap.fastmail.example',
            port: 993,
            secure: true,
            user: 'max@fastmail.example',
          },
        },
      }),
    ]);
    expect((await rt.auth.connectionSecrets(put.json.data.connectionId)).secrets).toEqual({
      smtp_password: 'smtp-app-password-1',
      imap_password: 'imap-app-password-1',
    });

    // Saving again (a new app password) keeps the same connection.
    const again = await call('PUT', '/v1/senders/max/channels/email', {
      key,
      body: { ...body('smtp-app-password-2', 'imap-app-password-2'), from: 'Max@Acme.com' },
    });
    expect(again.json.data).toMatchObject({
      connectionId: put.json.data.connectionId,
      address: 'max@acme.com',
    });
  });

  it('a refused login is a 422 with the probe code, and nothing is stored', async () => {
    await call('PUT', '/v1/senders/dana', { key, body: { name: 'Dana' } });
    answer = {
      ok: false,
      code: 'IMAP_AUTH_FAILED',
      error: 'IMAP login was refused: Invalid credentials',
    };
    const put = await call('PUT', '/v1/senders/dana/channels/email', { key, body: body() });
    expect(put.status).toBe(422);
    expect(put.json.error).toEqual({
      code: 'IMAP_AUTH_FAILED',
      message: 'IMAP login was refused: Invalid credentials',
    });
    const detail = await call('GET', '/v1/senders/dana', { key });
    expect(detail.json.data.connections).toEqual([]);
    expect(detail.json.data.readiness.email.ok).toBe(false);
  });

  it('needs a from address when the login is not one and the sender has no email', async () => {
    answer = { ok: true };
    const b = body();
    const put = await call('PUT', '/v1/senders/dana/channels/email', {
      key,
      body: { ...b, smtp: { ...b.smtp, user: 'dana' } },
    });
    expect(put.status).toBe(422);
    expect(put.json.error.code).toBe('FROM_REQUIRED');
  });

  it('rejects a body without IMAP settings or with unknown fields', async () => {
    const noImap: Partial<ReturnType<typeof body>> = body();
    delete noImap.imap;
    expect(
      (await call('PUT', '/v1/senders/max/channels/email', { key, body: noImap })).status
    ).toBe(400);
    expect(
      (
        await call('PUT', '/v1/senders/max/channels/email', {
          key,
          body: { ...body(), provider: 'google' },
        })
      ).status
    ).toBe(400);
  });

  it('disconnecting Google leaves an SMTP channel alone; removing the email channel deletes the passwords', async () => {
    answer = { ok: true };
    await call('PUT', '/v1/senders/lee', { key, body: { name: 'Lee', email: 'lee@acme.com' } });
    const put = await call('PUT', '/v1/senders/lee/channels/email', { key, body: body() });
    const connectionId = put.json.data.connectionId as string;

    expect((await call('DELETE', '/v1/senders/lee/connections/google', { key })).status).toBe(200);
    expect((await call('GET', '/v1/senders/lee/readiness', { key })).json.data.email).toEqual({
      ok: true,
    });

    expect((await call('DELETE', '/v1/senders/lee/channels/email', { key })).status).toBe(200);
    const detail = await call('GET', '/v1/senders/lee', { key });
    expect(detail.json.data.channels).toEqual([]);
    expect(detail.json.data.readiness.email.ok).toBe(false);
    expect(detail.json.data.connections).toEqual([
      expect.objectContaining({ id: connectionId, provider: 'smtp', status: 'disconnected' }),
    ]);
    await expect(rt.auth.connectionSecrets(connectionId)).rejects.toMatchObject({
      code: 'CREDENTIALS_NEEDED',
    });
  });

  it('connecting Google afterwards moves the channel back to Gmail', async () => {
    const connected = await call('POST', '/v1/senders/max/connections/google', { key, body: {} });
    expect(connected.json.data.channel).toMatchObject({
      address: 'max@acme.com',
      config: { provider: 'google' },
    });
  });
});
