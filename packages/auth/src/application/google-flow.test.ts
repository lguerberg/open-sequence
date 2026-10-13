/**
 * The Google flow end to end against msw: consent URL, code exchange, token storage, cached and
 * serialized refreshes, invalid_grant, revoke.
 */
import { eq } from 'drizzle-orm';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GOOGLE_SCOPES } from './deps.js';
import { createAuth } from '../index.js';
import { connections } from '../infrastructure/persistence/schema.js';
import { closeTestDb, KEY_A, migrateTestDb, testDb, uniq } from '../test/db.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const PUBLIC_URL = 'https://seq.example.com';

interface Seen {
  token: URLSearchParams[];
  revoke: URLSearchParams[];
}

function googleServer(seen: Seen, opts: { grantedScope?: string; deadRefreshTokens?: Set<string>; email?: string } = {}) {
  return setupServer(
    http.post(TOKEN_URL, async ({ request }) => {
      const form = new URLSearchParams(await request.text());
      seen.token.push(form);
      if (form.get('grant_type') === 'authorization_code') {
        return HttpResponse.json({
          access_token: `ya29.code-${form.get('code')}`,
          expires_in: 3599,
          refresh_token: `1//rt-${form.get('code')}`,
          scope: opts.grantedScope ?? Object.values(GOOGLE_SCOPES).join(' '),
          token_type: 'Bearer',
        });
      }
      const rt = form.get('refresh_token') ?? '';
      if (opts.deadRefreshTokens?.has(rt)) {
        return HttpResponse.json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, { status: 400 });
      }
      return HttpResponse.json({ access_token: `ya29.refreshed-${seen.token.length}`, expires_in: 3599, scope: '', token_type: 'Bearer' });
    }),
    http.get(USERINFO_URL, () => HttpResponse.json({ sub: '1', email: opts.email ?? 'rep@example.com', email_verified: true })),
    http.post(REVOKE_URL, async ({ request }) => {
      seen.revoke.push(new URLSearchParams(await request.text()));
      return new HttpResponse(null, { status: 200 });
    })
  );
}

describe('Google OAuth flow', () => {
  beforeAll(migrateTestDb);
  afterAll(closeTestDb);

  let server: ReturnType<typeof setupServer> | undefined;
  afterEach(() => {
    server?.close();
    server = undefined;
  });

  // No `google` override: the real GoogleOAuthClient talks to msw.
  const makeAuth = (clock?: { now(): Date }) => createAuth({ db: testDb(), encryptionKeys: KEY_A, publicUrl: PUBLIC_URL, ...(clock ? { clock } : {}) });

  async function registeredTenant(auth: ReturnType<typeof makeAuth>) {
    const tenantId = uniq('prj');
    await auth.registerCredential({ tenantId, provider: 'google', method: 'oauth2', secrets: { client_id: 'cid-123.apps', client_secret: 'GOCSPX-xyz' } });
    return tenantId;
  }

  it('connect: the consent URL carries the client id, the scopes, offline access, consent and a signed state', async () => {
    const auth = makeAuth();
    const tenantId = await registeredTenant(auth);
    const ownerId = uniq('snd');
    const { authUrl, connectionId } = await auth.connect({ tenantId, ownerId, returnUrl: 'https://app.example.com/settings' });
    const url = new URL(authUrl);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('cid-123.apps');
    expect(url.searchParams.get('redirect_uri')).toBe(`${PUBLIC_URL}/v1/connections/google/callback`);
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('include_granted_scopes')).toBe('true');
    const scope = url.searchParams.get('scope')!.split(' ');
    expect(scope).toEqual(expect.arrayContaining([GOOGLE_SCOPES.send, GOOGLE_SCOPES.read, GOOGLE_SCOPES.calendar]));
    const state = url.searchParams.get('state')!;
    const body = JSON.parse(Buffer.from(state.split('.')[0]!, 'base64url').toString());
    expect(body).toMatchObject({ tenantId, ownerId, connectionId, returnUrl: 'https://app.example.com/settings' });
    expect(connectionId).toMatch(/^con_/);
    expect((await auth.connectionStatus(connectionId)).status).toBe('pending');

    // A second connect for the same owner reuses the row.
    expect((await auth.connect({ tenantId, ownerId })).connectionId).toBe(connectionId);
  });

  it('connect refuses a tenant without a Google client', async () => {
    await expect(makeAuth().connect({ tenantId: uniq('prj'), ownerId: uniq('snd') })).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });
  });

  it('callback: exchanges the code, stores the refresh token encrypted, the scopes and the account', async () => {
    const seen: Seen = { token: [], revoke: [] };
    server = googleServer(seen);
    server.listen({ onUnhandledRequest: 'error' });
    const auth = makeAuth();
    const tenantId = await registeredTenant(auth);
    const ownerId = uniq('snd');
    const { authUrl, connectionId } = await auth.connect({ tenantId, ownerId, returnUrl: 'https://app/x' });
    const state = new URL(authUrl).searchParams.get('state')!;

    const result = await auth.handleCallback({ state, code: 'c0de' });
    expect(result).toEqual({ connectionId, tenantId, ownerId, account: 'rep@example.com', scopes: Object.values(GOOGLE_SCOPES), returnUrl: 'https://app/x' });
    expect(seen.token).toHaveLength(1);
    expect(Object.fromEntries(seen.token[0]!)).toEqual({
      client_id: 'cid-123.apps',
      client_secret: 'GOCSPX-xyz',
      code: 'c0de',
      redirect_uri: `${PUBLIC_URL}/v1/connections/google/callback`,
      grant_type: 'authorization_code',
    });

    const [row] = await testDb().select().from(connections).where(eq(connections.id, connectionId));
    expect(row).toMatchObject({ status: 'active', account: 'rep@example.com', keyId: 'ka' });
    expect(row!.secretEnc).not.toContain('1//rt-c0de');
    expect(row!.lastOkAt).toBeInstanceOf(Date);
    const view = await auth.connectionStatus(connectionId);
    expect(JSON.stringify(view)).not.toContain('1//rt-');
    expect(JSON.stringify(view)).not.toContain('secretEnc');
    expect(await auth.listConnections(tenantId, ownerId)).toHaveLength(1);

    // The access token from the exchange is cached: no refresh call yet.
    expect(await auth.getAccessToken(connectionId)).toBe('ya29.code-c0de');
    expect(seen.token).toHaveLength(1);
  });

  it('callback refuses a grant missing the Gmail scopes and marks reauth_needed', async () => {
    const seen: Seen = { token: [], revoke: [] };
    server = googleServer(seen, { grantedScope: `${GOOGLE_SCOPES.read} ${GOOGLE_SCOPES.email}` });
    server.listen({ onUnhandledRequest: 'error' });
    const auth = makeAuth();
    const tenantId = await registeredTenant(auth);
    const { authUrl, connectionId } = await auth.connect({ tenantId, ownerId: uniq('snd') });
    const state = new URL(authUrl).searchParams.get('state')!;
    await expect(auth.handleCallback({ state, code: 'partial' })).rejects.toMatchObject({ code: 'SCOPES_MISSING', details: { missing: [GOOGLE_SCOPES.send] } });
    const view = await auth.connectionStatus(connectionId);
    expect(view.status).toBe('reauth_needed');
    expect(view.lastError).toContain('gmail.send');
  });

  it('callback refuses an expired or tampered state before touching Google', async () => {
    const seen: Seen = { token: [], revoke: [] };
    server = googleServer(seen);
    server.listen({ onUnhandledRequest: 'error' });
    let now = new Date('2026-10-13T10:00:00Z');
    const auth = makeAuth({ now: () => now });
    const tenantId = await registeredTenant(auth);
    const { authUrl } = await auth.connect({ tenantId, ownerId: uniq('snd') });
    const state = new URL(authUrl).searchParams.get('state')!;
    now = new Date('2026-10-13T10:11:00Z');
    await expect(auth.handleCallback({ state, code: 'late' })).rejects.toMatchObject({ code: 'STATE_EXPIRED' });
    now = new Date('2026-10-13T10:01:00Z');
    await expect(auth.handleCallback({ state: `${state}x`, code: 'forged' })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(seen.token).toHaveLength(0);
  });

  it('getAccessToken: concurrent callers share one refresh, then the cache serves until two minutes before expiry', async () => {
    const seen: Seen = { token: [], revoke: [] };
    server = googleServer(seen);
    server.listen({ onUnhandledRequest: 'error' });
    let now = new Date('2026-10-13T10:00:00Z');
    const auth = makeAuth({ now: () => now });
    const tenantId = await registeredTenant(auth);
    const { authUrl, connectionId } = await auth.connect({ tenantId, ownerId: uniq('snd') });
    await auth.handleCallback({ state: new URL(authUrl).searchParams.get('state')!, code: 'cc' });
    expect(seen.token).toHaveLength(1);

    // The exchanged token expires in 3599s of wall time; jump the clock past that.
    now = new Date(now.getTime() + 3600_000);
    const tokens = await Promise.all([1, 2, 3, 4, 5].map(() => auth.getAccessToken(connectionId)));
    expect(new Set(tokens).size).toBe(1);
    expect(seen.token).toHaveLength(2);
    expect(Object.fromEntries(seen.token[1]!)).toEqual({ client_id: 'cid-123.apps', client_secret: 'GOCSPX-xyz', refresh_token: '1//rt-cc', grant_type: 'refresh_token' });

    // Cached: no new call.
    expect(await auth.getAccessToken(connectionId)).toBe(tokens[0]);
    expect(seen.token).toHaveLength(2);

    // Inside the two-minute window before expiry a refresh happens again.
    now = new Date(now.getTime() + 3599_000 - 60_000);
    const fresh = await auth.getAccessToken(connectionId);
    expect(fresh).not.toBe(tokens[0]);
    expect(seen.token).toHaveLength(3);
    expect((await auth.connectionStatus(connectionId)).lastOkAt?.getTime()).toBe(now.getTime());
  });

  it('invalid_grant marks the connection credentials_needed, and health reports it', async () => {
    const seen: Seen = { token: [], revoke: [] };
    server = googleServer(seen, { deadRefreshTokens: new Set(['1//rt-dead']) });
    server.listen({ onUnhandledRequest: 'error' });
    const auth = makeAuth();
    const tenantId = await registeredTenant(auth);
    const { authUrl, connectionId } = await auth.connect({ tenantId, ownerId: uniq('snd') });
    await auth.handleCallback({ state: new URL(authUrl).searchParams.get('state')!, code: 'dead' });

    const health = await auth.health(connectionId);
    expect(health).toMatchObject({ ok: false, status: 'credentials_needed' });
    expect(health.error).toMatch(/^credentials_needed/);
    expect(health.lastError).toContain('invalid_grant');
    expect(health.lastError).not.toContain('1//rt-dead');

    await expect(auth.getAccessToken(connectionId)).rejects.toThrow(/^credentials_needed/);
    // No further call to Google for a connection known to be dead.
    expect(seen.token).toHaveLength(2);
  });

  it('revoke: tells Google, deletes the secret and disconnects; connect again starts over', async () => {
    const seen: Seen = { token: [], revoke: [] };
    server = googleServer(seen);
    server.listen({ onUnhandledRequest: 'error' });
    const auth = makeAuth();
    const tenantId = await registeredTenant(auth);
    const ownerId = uniq('snd');
    const { authUrl, connectionId } = await auth.connect({ tenantId, ownerId });
    await auth.handleCallback({ state: new URL(authUrl).searchParams.get('state')!, code: 'bye' });

    const view = await auth.revoke(connectionId);
    expect(view.status).toBe('disconnected');
    expect(seen.revoke.map((f) => f.get('token'))).toEqual(['1//rt-bye']);
    const [row] = await testDb().select().from(connections).where(eq(connections.id, connectionId));
    expect(row).toMatchObject({ secretEnc: null, keyId: null, status: 'disconnected' });
    await expect(auth.getAccessToken(connectionId)).rejects.toThrow(/^credentials_needed/);

    const again = await auth.connect({ tenantId, ownerId });
    expect(again.connectionId).toBe(connectionId);
    expect((await auth.connectionStatus(connectionId)).status).toBe('pending');
  });
});
