/**
 * The public view of a credential: enough to show "Allo key ending in 7f3a, active, encrypted under
 * k2" and never the secret itself.
 */
import type { Credential, CredentialMethod, CredentialStatus } from '../domain/entities.js';
import { notFound } from '../domain/errors.js';
import type { Cipher } from '../domain/ports.js';
import type { AuthDeps } from './deps.js';

export interface CredentialView {
  id: string;
  tenantId: string;
  provider: string;
  method: CredentialMethod;
  status: CredentialStatus;
  keyId: string;
  last4: string;
  /** Non-secret settings (probed scopes). */
  config: Record<string, unknown>;
  hasWebhookSecret: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function credentialView(cipher: Cipher, c: Credential): CredentialView {
  const last4 = cipher.decrypt(c.secretEnc, c.keyId).slice(-4);
  return {
    id: c.id,
    tenantId: c.tenantId,
    provider: c.provider,
    method: c.method,
    status: c.status,
    keyId: c.keyId,
    last4,
    config: c.config,
    hasWebhookSecret: c.webhookSecretEnc !== null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export async function credentialStatus(deps: AuthDeps, tenantId: string, provider: string): Promise<CredentialView> {
  const c = await deps.credentials.byTenantAndProvider(tenantId, provider);
  if (!c) throw notFound('credential', `${tenantId}/${provider}`);
  return credentialView(deps.cipher, c);
}

export async function listCredentials(deps: AuthDeps, tenantId: string): Promise<CredentialView[]> {
  const rows = await deps.credentials.listByTenant(tenantId);
  return rows.map((c) => credentialView(deps.cipher, c));
}
