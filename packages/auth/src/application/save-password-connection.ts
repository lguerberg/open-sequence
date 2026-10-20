/**
 * Stores an owner's password-based connection (SMTP and IMAP settings, for one): the passwords
 * encrypted together as one secret, the rest (hosts, ports, user names) as plain config, and the
 * row `active`. One connection per owner and provider, so saving again replaces the settings.
 * The host proves the settings work before calling this; the secrets are never returned.
 */
import { AuthError, invalid } from '../domain/errors.js';
import type { AuthDeps } from './deps.js';
import { connectionView, type ConnectionView } from './connection-status.js';

export interface SavePasswordConnectionInput {
  tenantId: string;
  ownerId: string;
  provider: string;
  /** The mailbox address the connection acts as. */
  account: string;
  /** Non-secret settings, returned as-is in the connection view. */
  config: Record<string, unknown>;
  /** Every value is a secret (passwords); stored encrypted as one JSON object. */
  secrets: Record<string, string>;
}

export async function savePasswordConnection(
  deps: AuthDeps,
  input: SavePasswordConnectionInput
): Promise<ConnectionView> {
  if (Object.keys(input.secrets).length === 0)
    throw invalid('MISSING_SECRET', 'A password connection needs at least one secret.');

  const enc = deps.cipher.encrypt(JSON.stringify(input.secrets));
  const now = deps.clock.now();
  const fields = {
    account: input.account,
    scopes: [],
    secretEnc: enc.ciphertext,
    keyId: enc.keyId,
    status: 'active' as const,
    config: input.config,
    lastOkAt: now,
    lastError: null,
  };

  const existing = await deps.connections.byOwnerAndProvider(input.ownerId, input.provider);
  if (existing && existing.tenantId !== input.tenantId)
    throw new AuthError('CONFLICT', 'This owner already has a connection in another tenant.', 409);
  const saved = existing
    ? await deps.connections.update(existing.id, fields)
    : await deps.connections.create({
        id: deps.ids.next('connection'),
        tenantId: input.tenantId,
        ownerId: input.ownerId,
        provider: input.provider,
        ...fields,
      });
  return connectionView(saved);
}
