/**
 * Stores a tenant's credential for a provider: its OAuth client (client_id, client_secret) or a
 * workspace API key (api_key, optional webhook_secret). An API key is probed first and refused
 * when the probe fails. The secret is encrypted on arrival and never returned.
 */
import type { Credential, CredentialMethod } from '../domain/entities.js';
import { AuthError, invalid } from '../domain/errors.js';
import type { Probe } from '../domain/ports.js';
import type { AuthDeps } from './deps.js';
import { credentialView, type CredentialView } from './credential-status.js';

export interface RegisterCredentialInput {
  tenantId: string;
  provider: string;
  method: CredentialMethod;
  secrets: Record<string, string>;
  probe?: Probe;
}

export async function registerCredential(deps: AuthDeps, input: RegisterCredentialInput): Promise<CredentialView> {
  const { secret, webhookSecret, config } = split(input.method, input.secrets);

  if (input.method === 'api_key' && input.probe) {
    const result = await input.probe(input.secrets);
    if (!result.ok) {
      throw new AuthError(
        'INVALID_CREDENTIAL',
        `The ${input.provider} key was refused${result.missing?.length ? ` (missing: ${result.missing.join(', ')})` : ''}${result.error ? `: ${result.error}` : '.'}`,
        422,
        { missing: result.missing ?? [], error: result.error ?? null }
      );
    }
    if (result.scopes) config['scopes'] = result.scopes;
  }

  const enc = deps.cipher.encrypt(secret);
  const row: Omit<Credential, 'createdAt' | 'updatedAt'> = {
    id: deps.ids.next('credential'),
    tenantId: input.tenantId,
    provider: input.provider,
    method: input.method,
    status: 'active',
    secretEnc: enc.ciphertext,
    keyId: enc.keyId,
    webhookSecretEnc: webhookSecret ? deps.cipher.encrypt(webhookSecret).ciphertext : null,
    config,
  };
  return credentialView(deps.cipher, await deps.credentials.upsert(row));
}

function split(method: CredentialMethod, secrets: Record<string, string>): { secret: string; webhookSecret: string | null; config: Record<string, unknown> } {
  if (method === 'oauth2') {
    const clientId = secrets['client_id'];
    const clientSecret = secrets['client_secret'];
    if (!clientId || !clientSecret) throw invalid('MISSING_SECRET', 'An oauth2 credential needs client_id and client_secret.');
    const config: Record<string, unknown> = { client_id: clientId };
    if (secrets['pubsub_topic']) config['pubsub_topic'] = secrets['pubsub_topic'];
    return { secret: clientSecret, webhookSecret: null, config };
  }
  const apiKey = secrets['api_key'];
  if (!apiKey) throw invalid('MISSING_SECRET', 'An api_key credential needs api_key.');
  return { secret: apiKey, webhookSecret: secrets['webhook_secret'] ?? null, config: {} };
}
