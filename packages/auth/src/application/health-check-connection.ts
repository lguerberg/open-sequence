/**
 * Reports whether a connection can be used. A password connection (SMTP and IMAP) has no token to
 * refresh: its adapter proves it with a login, so this reports the row as stored.
 */
import type { AuthDeps } from './deps.js';
import { connectionView, type ConnectionView } from './connection-status.js';
import { requireConnection } from './shared.js';

export async function healthCheckConnection(deps: AuthDeps, connectionId: string): Promise<ConnectionView & { ok: boolean; error: string | null }> {
  const connection = await requireConnection(deps, connectionId);
  const ok = connection.status === 'active';
  return { ...connectionView(connection), ok, error: ok ? null : connection.lastError };
}
