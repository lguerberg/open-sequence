/**
 * The decrypted settings of a password-based connection, for adapters only (the SMTP adapter
 * reads its hosts and passwords here): the account, the plain config and the secrets map. A
 * connection that was disconnected or never saved answers `credentials_needed`, which the engine
 * reads as "ask the sender to set the channel again".
 */
import { AuthError } from '../domain/errors.js';
import { GOOGLE_PROVIDER, type AuthDeps } from './deps.js';
import { requireConnection } from './shared.js';

export interface ConnectionSecrets {
  account: string | null;
  config: Record<string, unknown>;
  secrets: Record<string, string>;
}

export async function connectionSecrets(
  deps: AuthDeps,
  connectionId: string
): Promise<ConnectionSecrets> {
  const c = await requireConnection(deps, connectionId);
  // A Google refresh token never leaves through here; Google adapters get access tokens instead.
  if (c.provider === GOOGLE_PROVIDER)
    throw new AuthError(
      'WRONG_FLOW',
      `Connection ${connectionId} is a Google connection; use an access token.`,
      409
    );
  if (c.status !== 'active' || !c.secretEnc || !c.keyId) {
    throw new AuthError(
      'CREDENTIALS_NEEDED',
      `credentials_needed: connection ${connectionId} is ${c.status}; set the channel again.`,
      409
    );
  }
  const parsed: unknown = JSON.parse(deps.cipher.decrypt(c.secretEnc, c.keyId));
  const secrets: Record<string, string> = {};
  if (parsed && typeof parsed === 'object')
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string') secrets[k] = v;
  return { account: c.account, config: c.config, secrets };
}
