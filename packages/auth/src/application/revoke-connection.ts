/**
 * Disconnect: revoke the grant at Google (best effort; the secret goes regardless), delete the
 * refresh token, forget any cached access token, and mark the connection `disconnected`.
 */
import type { AuthDeps } from './deps.js';
import { connectionView, type ConnectionView } from './connection-status.js';
import { requireConnection } from './shared.js';

export async function revokeConnection(deps: AuthDeps, connectionId: string): Promise<ConnectionView> {
  const connection = await requireConnection(deps, connectionId);
  if (connection.secretEnc && connection.keyId) {
    try {
      await deps.google.revoke(deps.cipher.decrypt(connection.secretEnc, connection.keyId));
    } catch {
      // Google unreachable or the token already dead: the secret is deleted either way.
    }
  }
  deps.tokens.forget(connectionId);
  const updated = await deps.connections.update(connectionId, { secretEnc: null, keyId: null, status: 'disconnected', lastError: null });
  return connectionView(updated);
}
