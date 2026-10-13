/**
 * @opensequence/auth: provider credentials and the token lifecycle, with no idea what a sequence
 * is. Tenants and owners are opaque strings. `createAuth` is the composition root; the host hands
 * over its Drizzle database, SEQ_ENCRYPTION_KEYS and its public URL and gets the use cases bound.
 */
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { TokenCache, type AuthDeps } from './application/deps.js';
import { completeGoogleCallback, type CompleteGoogleCallbackInput } from './application/complete-google-callback.js';
import { connectionStatus } from './application/connection-status.js';
import { healthCheckCredential } from './application/credential-health.js';
import { credentialStatus, listCredentials } from './application/credential-status.js';
import { credentialsFor } from './application/credentials-for.js';
import { getAccessToken } from './application/get-access-token.js';
import { healthCheckConnection } from './application/health-check-connection.js';
import { listConnections } from './application/list-connections.js';
import { registerCredential, type RegisterCredentialInput } from './application/register-credential.js';
import { revokeConnection } from './application/revoke-connection.js';
import { rotateKeys } from './application/rotate-keys.js';
import { startGoogleConnect, type StartGoogleConnectInput } from './application/start-google-connect.js';
import { systemClock, type Clock, type OAuthClient, type Probe } from './domain/ports.js';
import { AesGcmCipher } from './infrastructure/crypto/aes-gcm-cipher.js';
import { HmacSigner } from './infrastructure/crypto/hmac-signer.js';
import { parseEncryptionKeys } from './infrastructure/crypto/keys.js';
import { GoogleOAuthClient } from './infrastructure/google/google-oauth-client.js';
import { newId } from './infrastructure/ids.js';
import { DrizzleConnectionRepository } from './infrastructure/persistence/repositories/connections.repo.js';
import { DrizzleCredentialRepository } from './infrastructure/persistence/repositories/credentials.repo.js';

/** The route the host mounts for Google's redirect; `connect` builds the redirect URI from it. */
export const GOOGLE_CALLBACK_PATH = '/v1/connections/google/callback';

export interface CreateAuthOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: PostgresJsDatabase<any>;
  /** `id:base64key[,id:base64key...]`; the first entry encrypts, every entry decrypts. */
  encryptionKeys: string;
  /** The base URL Google redirects to, without a trailing slash. */
  publicUrl: string;
  googleCallbackPath?: string;
  clock?: Clock;
  google?: OAuthClient;
}

export function createAuth(opts: CreateAuthOptions) {
  const keys = parseEncryptionKeys(opts.encryptionKeys);
  const callbackPath = opts.googleCallbackPath ?? GOOGLE_CALLBACK_PATH;
  const clock = opts.clock ?? systemClock;
  const deps: AuthDeps = {
    credentials: new DrizzleCredentialRepository(opts.db),
    connections: new DrizzleConnectionRepository(opts.db),
    cipher: new AesGcmCipher(keys),
    signer: new HmacSigner(keys),
    clock,
    ids: { next: newId },
    google: opts.google ?? new GoogleOAuthClient({ now: () => clock.now().getTime() }),
    googleRedirectUri: `${opts.publicUrl.replace(/\/$/, '')}${callbackPath}`,
    tokens: new TokenCache(),
  };

  const accessToken = (connectionId: string) => getAccessToken(deps, connectionId);
  const forTenant = (tenantId: string, provider: string) => credentialsFor(deps, tenantId, provider);

  return {
    /** The redirect URI registered with the tenant's Google client. */
    googleRedirectUri: deps.googleRedirectUri,

    // ---- credentials (tenant level)
    registerCredential: (input: RegisterCredentialInput) => registerCredential(deps, input),
    credentialStatus: (tenantId: string, provider: string) => credentialStatus(deps, tenantId, provider),
    listCredentials: (tenantId: string) => listCredentials(deps, tenantId),
    healthCheckCredential: (tenantId: string, provider: string, probe: Probe) => healthCheckCredential(deps, tenantId, provider, probe),
    /** For adapters only: the decrypted secrets map. CredentialSource-compatible. */
    credentialsFor: forTenant,

    // ---- connections (owner level, OAuth)
    connect: (input: StartGoogleConnectInput) => startGoogleConnect(deps, input),
    handleCallback: (input: CompleteGoogleCallbackInput) => completeGoogleCallback(deps, input),
    getAccessToken: accessToken,
    /** TokenSource-compatible alias of getAccessToken. */
    accessToken,
    connectionStatus: (connectionId: string) => connectionStatus(deps, connectionId),
    listConnections: (tenantId: string, ownerId?: string) => listConnections(deps, tenantId, ownerId),
    health: (connectionId: string) => healthCheckConnection(deps, connectionId),
    revoke: (connectionId: string) => revokeConnection(deps, connectionId),

    // ---- operations
    rotateKeys: () => rotateKeys(deps),
  };
}

export type Auth = ReturnType<typeof createAuth>;

export { runAuthMigrations } from './infrastructure/persistence/migrator.js';
export { schema as authSchema, credentials as credentialsTable, connections as connectionsTable } from './infrastructure/persistence/schema.js';
export { AesGcmCipher } from './infrastructure/crypto/aes-gcm-cipher.js';
export { GoogleOAuthClient, type GoogleOAuthClientOptions } from './infrastructure/google/google-oauth-client.js';
export { parseEncryptionKeys } from './infrastructure/crypto/keys.js';
export { AuthError } from './domain/errors.js';
export { GOOGLE_SCOPES, GOOGLE_REQUESTED_SCOPES, GOOGLE_REQUIRED_SCOPES } from './application/deps.js';
export type { Credential, CredentialMethod, CredentialStatus, Connection, ConnectionStatus } from './domain/entities.js';
export type { Cipher, Clock, CredentialSource, OAuthClient, OAuthClientCredentials, OAuthGrant, Probe, ProbeResult, Signer, TokenSource } from './domain/ports.js';
export type { CredentialRepository, ConnectionRepository } from './domain/repositories.js';
export type { CredentialView } from './application/credential-status.js';
export type { ConnectionView } from './application/connection-status.js';
export type { RegisterCredentialInput } from './application/register-credential.js';
export type { StartGoogleConnectInput, StartGoogleConnectResult } from './application/start-google-connect.js';
export type { CompleteGoogleCallbackInput, CompleteGoogleCallbackResult } from './application/complete-google-callback.js';
export type { RotateKeysResult } from './application/rotate-keys.js';
