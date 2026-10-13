/**
 * Helpers two or more connection use cases share: the tenant's Google client, and a connection
 * that must exist.
 */
import type { Connection } from '../domain/entities.js';
import { AuthError, notFound } from '../domain/errors.js';
import type { OAuthClientCredentials } from '../domain/ports.js';
import { GOOGLE_PROVIDER, type AuthDeps } from './deps.js';
import { decryptCredential } from './credentials-for.js';

export async function googleClientFor(deps: AuthDeps, tenantId: string): Promise<OAuthClientCredentials> {
  const c = await deps.credentials.byTenantAndProvider(tenantId, GOOGLE_PROVIDER);
  if (!c || c.method !== 'oauth2') {
    throw new AuthError('PROVIDER_NOT_CONFIGURED', 'No Google OAuth client is registered for this tenant. Register one (client_id, client_secret) first.', 409);
  }
  const secrets = decryptCredential(deps.cipher, c);
  return { clientId: secrets['client_id']!, clientSecret: secrets['client_secret']! };
}

export async function requireConnection(deps: AuthDeps, connectionId: string): Promise<Connection> {
  const c = await deps.connections.byId(connectionId);
  if (!c) throw notFound('connection', connectionId);
  return c;
}

export const isInvalidGrant = (err: unknown): boolean => err instanceof Error && err.message.startsWith('invalid_grant');

/** The one-line reason stored on the row; never includes a token. */
export const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err)).slice(0, 500);
