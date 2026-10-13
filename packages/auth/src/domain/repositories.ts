import type { Connection, Credential } from './entities.js';

export interface CredentialRepository {
  byTenantAndProvider(tenantId: string, provider: string): Promise<Credential | null>;
  listByTenant(tenantId: string): Promise<Credential[]>;
  /** Insert, or replace the secret, config and status of the row with the same (tenant, provider). */
  upsert(c: Omit<Credential, 'createdAt' | 'updatedAt'>): Promise<Credential>;
  setStatus(id: string, status: Credential['status']): Promise<void>;
  /** Every row not encrypted under `keyId`, for rotation. */
  listNotUnderKey(keyId: string): Promise<Credential[]>;
  reencrypt(id: string, patch: { secretEnc: string; webhookSecretEnc: string | null; keyId: string }): Promise<void>;
}

export interface ConnectionRepository {
  byId(id: string): Promise<Connection | null>;
  byOwnerAndProvider(ownerId: string, provider: string): Promise<Connection | null>;
  list(tenantId: string, ownerId?: string): Promise<Connection[]>;
  create(c: Omit<Connection, 'createdAt' | 'updatedAt'>): Promise<Connection>;
  update(id: string, patch: Partial<Omit<Connection, 'id' | 'tenantId' | 'ownerId' | 'provider' | 'createdAt' | 'updatedAt'>>): Promise<Connection>;
  listNotUnderKey(keyId: string): Promise<Connection[]>;
  reencrypt(id: string, patch: { secretEnc: string; keyId: string }): Promise<void>;
}
