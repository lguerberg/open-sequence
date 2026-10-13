/**
 * Re-probes an API key. A failing probe marks the credential `invalid` so the host can pause the
 * steps that need it; a passing one puts it back to `active`.
 */
import type { Probe } from '../domain/ports.js';
import { notFound } from '../domain/errors.js';
import type { AuthDeps } from './deps.js';
import { decryptCredential } from './credentials-for.js';
import { credentialView, type CredentialView } from './credential-status.js';

export async function healthCheckCredential(deps: AuthDeps, tenantId: string, provider: string, probe: Probe): Promise<CredentialView & { error: string | null }> {
  const c = await deps.credentials.byTenantAndProvider(tenantId, provider);
  if (!c) throw notFound('credential', `${tenantId}/${provider}`);
  const result = await probe(decryptCredential(deps.cipher, c));
  const status = result.ok ? 'active' : 'invalid';
  if (status !== c.status) await deps.credentials.setStatus(c.id, status);
  return { ...credentialView(deps.cipher, { ...c, status }), error: result.ok ? null : (result.error ?? 'probe failed') };
}
