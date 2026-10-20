/**
 * The decrypted secrets map, for adapters only (section 3.2: one of the two ways a secret leaves
 * this module): { api_key, webhook_secret? }.
 */
import type { Credential } from '../domain/entities.js';
import { AuthError, notFound } from '../domain/errors.js';
import type { Cipher } from '../domain/ports.js';
import type { AuthDeps } from './deps.js';

export function decryptCredential(cipher: Cipher, c: Credential): Record<string, string> {
  const secret = cipher.decrypt(c.secretEnc, c.keyId);
  const out: Record<string, string> = { api_key: secret };
  if (c.webhookSecretEnc) out['webhook_secret'] = cipher.decrypt(c.webhookSecretEnc, c.keyId);
  return out;
}

export async function credentialsFor(deps: AuthDeps, tenantId: string, provider: string): Promise<Record<string, string>> {
  const c = await deps.credentials.byTenantAndProvider(tenantId, provider);
  if (!c) throw notFound('credential', `${tenantId}/${provider}`);
  if (c.status !== 'active') {
    throw new AuthError('CREDENTIAL_INVALID', `The ${provider} credential was marked invalid by a health check. Register a new one.`, 409);
  }
  return decryptCredential(deps.cipher, c);
}
