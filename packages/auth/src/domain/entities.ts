/**
 * Two things live here and nothing else: a tenant's credential for a provider (its own OAuth
 * client, or a workspace API key) and an owner's OAuth connection (one authorized account).
 * Tenants and owners are opaque strings; this package knows nothing about what they are.
 */
export type CredentialMethod = 'oauth2' | 'api_key';
export type CredentialStatus = 'active' | 'invalid';
export type ConnectionStatus = 'pending' | 'active' | 'credentials_needed' | 'reauth_needed' | 'restricted' | 'disconnected';

export interface Credential {
  id: string;
  tenantId: string;
  provider: string;
  method: CredentialMethod;
  status: CredentialStatus;
  /** oauth2: the client secret. api_key: the key. Encrypted, see Cipher. */
  secretEnc: string;
  keyId: string;
  webhookSecretEnc: string | null;
  /** Non-secret settings: client_id, pubsub_topic, the scopes a probe reported. */
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Connection {
  id: string;
  tenantId: string;
  ownerId: string;
  provider: string;
  /** The account at the provider (a Gmail address). Null until the consent flow completes. */
  account: string | null;
  scopes: string[];
  /** The refresh token, encrypted. Null while pending and after disconnect. */
  secretEnc: string | null;
  keyId: string | null;
  status: ConnectionStatus;
  config: Record<string, unknown>;
  lastOkAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const CONNECTION_STATUSES: readonly ConnectionStatus[] = ['pending', 'active', 'credentials_needed', 'reauth_needed', 'restricted', 'disconnected'];
