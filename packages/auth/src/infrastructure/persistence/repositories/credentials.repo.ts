import { and, eq, ne } from 'drizzle-orm';
import type { Credential } from '../../../domain/entities.js';
import type { CredentialRepository } from '../../../domain/repositories.js';
import type { AuthDb } from '../db.js';
import { credentials } from '../schema.js';

type Row = typeof credentials.$inferSelect;

const toEntity = (r: Row): Credential => ({ ...r, method: r.method as Credential['method'], status: r.status as Credential['status'] });

export class DrizzleCredentialRepository implements CredentialRepository {
  constructor(private readonly db: AuthDb) {}

  async byTenantAndProvider(tenantId: string, provider: string): Promise<Credential | null> {
    const [row] = await this.db
      .select()
      .from(credentials)
      .where(and(eq(credentials.tenantId, tenantId), eq(credentials.provider, provider)));
    return row ? toEntity(row) : null;
  }

  async listByTenant(tenantId: string): Promise<Credential[]> {
    const rows = await this.db.select().from(credentials).where(eq(credentials.tenantId, tenantId)).orderBy(credentials.createdAt);
    return rows.map(toEntity);
  }

  async upsert(c: Omit<Credential, 'createdAt' | 'updatedAt'>): Promise<Credential> {
    const [row] = await this.db
      .insert(credentials)
      .values(c)
      .onConflictDoUpdate({
        target: [credentials.tenantId, credentials.provider],
        set: {
          method: c.method,
          status: c.status,
          secretEnc: c.secretEnc,
          keyId: c.keyId,
          webhookSecretEnc: c.webhookSecretEnc,
          config: c.config,
          updatedAt: new Date(),
        },
      })
      .returning();
    return toEntity(row!);
  }

  async setStatus(id: string, status: Credential['status']): Promise<void> {
    await this.db.update(credentials).set({ status, updatedAt: new Date() }).where(eq(credentials.id, id));
  }

  async listNotUnderKey(keyId: string): Promise<Credential[]> {
    const rows = await this.db.select().from(credentials).where(ne(credentials.keyId, keyId));
    return rows.map(toEntity);
  }

  async reencrypt(id: string, patch: { secretEnc: string; webhookSecretEnc: string | null; keyId: string }): Promise<void> {
    await this.db.update(credentials).set({ ...patch, updatedAt: new Date() }).where(eq(credentials.id, id));
  }
}
