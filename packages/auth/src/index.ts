/**
 * @opensequence/auth: provider credentials and the token lifecycle, with no idea what a sequence
 * is. Tenants and owners are opaque strings. `createAuth` is the composition root; the host hands
 * over its Drizzle database and SEQ_ENCRYPTION_KEYS and gets the use cases bound.
 */
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { AuthDeps } from './application/deps.js';
import { connectionSecrets } from './application/connection-secrets.js';
import { connectionStatus } from './application/connection-status.js';
import { healthCheckCredential } from './application/credential-health.js';
import { credentialStatus, listCredentials } from './application/credential-status.js';
import { credentialsFor } from './application/credentials-for.js';
import { healthCheckConnection } from './application/health-check-connection.js';
import { listConnections } from './application/list-connections.js';
import { registerCredential, type RegisterCredentialInput } from './application/register-credential.js';
import { revokeConnection } from './application/revoke-connection.js';
import { rotateKeys } from './application/rotate-keys.js';
import { savePasswordConnection, type SavePasswordConnectionInput } from './application/save-password-connection.js';
import { systemClock, type Clock, type Probe } from './domain/ports.js';
import { AesGcmCipher } from './infrastructure/crypto/aes-gcm-cipher.js';
import { parseEncryptionKeys } from './infrastructure/crypto/keys.js';
import { newId } from './infrastructure/ids.js';
import { DrizzleConnectionRepository } from './infrastructure/persistence/repositories/connections.repo.js';
import { DrizzleCredentialRepository } from './infrastructure/persistence/repositories/credentials.repo.js';

export interface CreateAuthOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: PostgresJsDatabase<any>;
  /** `id:base64key[,id:base64key...]`; the first entry encrypts, every entry decrypts. */
  encryptionKeys: string;
  clock?: Clock;
}

export function createAuth(opts: CreateAuthOptions) {
  const keys = parseEncryptionKeys(opts.encryptionKeys);
  const clock = opts.clock ?? systemClock;
  const deps: AuthDeps = {
    credentials: new DrizzleCredentialRepository(opts.db),
    connections: new DrizzleConnectionRepository(opts.db),
    cipher: new AesGcmCipher(keys),
    clock,
    ids: { next: newId },
  };

  const forTenant = (tenantId: string, provider: string) => credentialsFor(deps, tenantId, provider);

  return {
    // ---- credentials (tenant level)
    registerCredential: (input: RegisterCredentialInput) => registerCredential(deps, input),
    credentialStatus: (tenantId: string, provider: string) => credentialStatus(deps, tenantId, provider),
    listCredentials: (tenantId: string) => listCredentials(deps, tenantId),
    healthCheckCredential: (tenantId: string, provider: string, probe: Probe) => healthCheckCredential(deps, tenantId, provider, probe),
    /** For adapters only: the decrypted secrets map. CredentialSource-compatible. */
    credentialsFor: forTenant,

    // ---- connections (owner level: one mailbox, SMTP and IMAP)
    connectionStatus: (connectionId: string) => connectionStatus(deps, connectionId),
    listConnections: (tenantId: string, ownerId?: string) => listConnections(deps, tenantId, ownerId),
    health: (connectionId: string) => healthCheckConnection(deps, connectionId),
    revoke: (connectionId: string) => revokeConnection(deps, connectionId),

    /** Stores the settings encrypted and marks the connection active; the host verifies them first. */
    savePasswordConnection: (input: SavePasswordConnectionInput) => savePasswordConnection(deps, input),
    /** For adapters only: the decrypted settings. ConnectionSecretSource-compatible. */
    connectionSecrets: (connectionId: string) => connectionSecrets(deps, connectionId),

    // ---- operations
    rotateKeys: () => rotateKeys(deps),
  };
}

export type Auth = ReturnType<typeof createAuth>;

export { runAuthMigrations } from './infrastructure/persistence/migrator.js';
export { schema as authSchema, credentials as credentialsTable, connections as connectionsTable } from './infrastructure/persistence/schema.js';
export { AesGcmCipher } from './infrastructure/crypto/aes-gcm-cipher.js';
export { parseEncryptionKeys } from './infrastructure/crypto/keys.js';
export { AuthError } from './domain/errors.js';
export type { Credential, CredentialMethod, CredentialStatus, Connection, ConnectionStatus } from './domain/entities.js';
export type { Cipher, Clock, ConnectionSecretSource, CredentialSource, Probe, ProbeResult } from './domain/ports.js';
export type { CredentialRepository, ConnectionRepository } from './domain/repositories.js';
export type { CredentialView } from './application/credential-status.js';
export type { ConnectionView } from './application/connection-status.js';
export type { RegisterCredentialInput } from './application/register-credential.js';
export type { RotateKeysResult } from './application/rotate-keys.js';
export type { SavePasswordConnectionInput } from './application/save-password-connection.js';
export type { ConnectionSecrets } from './application/connection-secrets.js';
