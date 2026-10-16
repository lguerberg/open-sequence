/**
 * Proves a connection still works by refreshing its token (bypassing the cache). A dead grant is
 * recorded as `credentials_needed`; anything else is reported without changing the status.
 * Password connections have no token: their adapter checks them (SMTP login), so this reports the row.
 */
import { GOOGLE_PROVIDER, type AuthDeps } from './deps.js';
import { connectionView, type ConnectionView } from './connection-status.js';
import { refreshAccessToken } from './get-access-token.js';
import { errorText, requireConnection } from './shared.js';

export async function healthCheckConnection(deps: AuthDeps, connectionId: string): Promise<ConnectionView & { ok: boolean; error: string | null }> {
  const before = await requireConnection(deps, connectionId);
  if (before.status !== 'active') return { ...connectionView(before), ok: false, error: before.lastError };
  if (before.provider !== GOOGLE_PROVIDER) return { ...connectionView(before), ok: true, error: null };
  let error: string | null = null;
  try {
    await refreshAccessToken(deps, connectionId);
  } catch (err) {
    error = errorText(err);
  }
  const after = await requireConnection(deps, connectionId);
  return { ...connectionView(after), ok: error === null, error };
}
