/**
 * Two things live here and nothing else: a tenant's credential for a provider (a workspace API
 * key) and an owner's connection (one mailbox, with its passwords).
 * Tenants and owners are opaque strings; this package knows nothing about what they are.
 */
export type CredentialMethod = 'api_key';
export type CredentialStatus = 'active' | 'invalid';
export type ConnectionStatus = 'pending' | 'active' | 'credentials_needed' | 'reauth_needed' | 'restricted' | 'disconnected';

export interface Credential {
  id: string;
  tenantId: string;
  provider: string;
  method: CredentialMethod;
  status: CredentialStatus;
  /** The API key, encrypted (see Cipher). */
  secretEnc: string;
  keyId: string;
  webhookSecretEnc: string | null;
  /** Non-secret settings, such as the scopes a probe reported. */
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Connection {
  id: string;
  tenantId: string;
  ownerId: string;
  provider: string;
  /** The account at the provider (a mailbox address). */
  account: string | null;
  scopes: string[];
  /** The passwords, encrypted as one JSON object. Null after disconnect. */
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
