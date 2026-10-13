/**
 * An in-memory OAuthClient for tests that are not about the wire format (the msw suite covers
 * that). Every exchanged code yields a distinct refresh token; refreshes count.
 */
import type { OAuthClient, OAuthGrant } from '../domain/ports.js';
import { GOOGLE_REQUESTED_SCOPES } from '../application/deps.js';

export function fakeGoogle(opts: { email?: string; scopes?: string[]; refreshToken?: string | null } = {}) {
  const calls = { exchange: 0, refresh: 0, revoke: [] as string[] };
  let n = 0;
  const client: OAuthClient = {
    authUrl: (p) => `https://accounts.example/auth?client_id=${p.clientId}&scope=${encodeURIComponent(p.scopes.join(' '))}&state=${p.state}`,
    async exchangeCode(_client, code): Promise<OAuthGrant> {
      calls.exchange += 1;
      return {
        refreshToken: opts.refreshToken === undefined ? `1//refresh-${code}` : opts.refreshToken,
        accessToken: `ya29.exchange-${++n}`,
        expiresAt: new Date(Date.now() + 3600_000),
        scopes: opts.scopes ?? GOOGLE_REQUESTED_SCOPES,
        email: opts.email ?? 'rep@example.com',
      };
    },
    async refresh(_client, refreshToken) {
      calls.refresh += 1;
      if (refreshToken.includes('dead')) throw new Error('invalid_grant: Token has been expired or revoked.');
      return { accessToken: `ya29.refresh-${++n}`, expiresAt: new Date(Date.now() + 3600_000) };
    },
    async revoke(token) {
      calls.revoke.push(token);
    },
  };
  return Object.assign(client, { calls });
}
