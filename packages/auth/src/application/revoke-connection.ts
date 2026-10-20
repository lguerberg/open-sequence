/**
 * Disconnect: delete the stored passwords and mark the connection `disconnected`. The adapter then
 * answers `credentials_needed` until the channel is set again.
 */
import type { AuthDeps } from './deps.js';
import { connectionView, type ConnectionView } from './connection-status.js';
import { requireConnection } from './shared.js';

export async function revokeConnection(deps: AuthDeps, connectionId: string): Promise<ConnectionView> {
  await requireConnection(deps, connectionId);
  const updated = await deps.connections.update(connectionId, { secretEnc: null, keyId: null, status: 'disconnected', lastError: null });
  return connectionView(updated);
}
