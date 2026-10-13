/**
 * An access token for a connection: from the per-replica cache while it has more than two minutes
 * left, otherwise one refresh with the stored refresh token, shared by every concurrent caller.
 * `invalid_grant` marks the connection `credentials_needed` and throws an Error whose message
 * starts with `credentials_needed`, so an executor can pause the owner's steps.
 */
import type { Connection } from '../domain/entities.js';
import type { AuthDeps } from './deps.js';
import { errorText, googleClientFor, isInvalidGrant, requireConnection } from './shared.js';

export const REFRESH_AHEAD_MS = 2 * 60 * 1000;

export async function getAccessToken(deps: AuthDeps, connectionId: string): Promise<string> {
  const cached = deps.tokens.get(connectionId);
  if (cached && cached.expiresAt.getTime() - deps.clock.now().getTime() > REFRESH_AHEAD_MS) return cached.accessToken;
  return deps.tokens.single(connectionId, () => refreshAccessToken(deps, connectionId));
}

/** Always talks to Google; the health check uses it to bypass the cache. */
export async function refreshAccessToken(deps: AuthDeps, connectionId: string): Promise<string> {
  const connection = await requireConnection(deps, connectionId);
  if (connection.status !== 'active' || !connection.secretEnc || !connection.keyId) {
    throw new Error(`${reasonFor(connection)}: connection ${connection.id} is ${connection.status}.`);
  }
  const client = await googleClientFor(deps, connection.tenantId);
  const refreshToken = deps.cipher.decrypt(connection.secretEnc, connection.keyId);
  try {
    const fresh = await deps.google.refresh(client, refreshToken);
    deps.tokens.set(connectionId, fresh);
    await deps.connections.update(connectionId, { lastOkAt: deps.clock.now(), lastError: null });
    return fresh.accessToken;
  } catch (err) {
    if (isInvalidGrant(err)) {
      deps.tokens.forget(connectionId);
      await deps.connections.update(connectionId, { status: 'credentials_needed', lastError: errorText(err) });
      throw new Error(`credentials_needed: Google no longer accepts the stored grant for connection ${connectionId}; the owner must reconnect.`);
    }
    throw err;
  }
}

function reasonFor(c: Connection): string {
  return c.status === 'reauth_needed' ? 'reauth_needed' : 'credentials_needed';
}
