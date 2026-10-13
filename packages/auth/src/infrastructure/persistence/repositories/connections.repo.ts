import { and, eq, ne } from 'drizzle-orm';
import type { Connection } from '../../../domain/entities.js';
import type { ConnectionRepository } from '../../../domain/repositories.js';
import type { AuthDb } from '../db.js';
import { connections } from '../schema.js';

type Row = typeof connections.$inferSelect;

const toEntity = (r: Row): Connection => ({ ...r, status: r.status as Connection['status'] });

export class DrizzleConnectionRepository implements ConnectionRepository {
  constructor(private readonly db: AuthDb) {}

  async byId(id: string): Promise<Connection | null> {
    const [row] = await this.db.select().from(connections).where(eq(connections.id, id));
    return row ? toEntity(row) : null;
  }

  async byOwnerAndProvider(ownerId: string, provider: string): Promise<Connection | null> {
    const [row] = await this.db
      .select()
      .from(connections)
      .where(and(eq(connections.ownerId, ownerId), eq(connections.provider, provider)));
    return row ? toEntity(row) : null;
  }

  async list(tenantId: string, ownerId?: string): Promise<Connection[]> {
    const where = ownerId ? and(eq(connections.tenantId, tenantId), eq(connections.ownerId, ownerId)) : eq(connections.tenantId, tenantId);
    const rows = await this.db.select().from(connections).where(where).orderBy(connections.createdAt);
    return rows.map(toEntity);
  }

  async create(c: Omit<Connection, 'createdAt' | 'updatedAt'>): Promise<Connection> {
    const [row] = await this.db.insert(connections).values(c).returning();
    return toEntity(row!);
  }

  async update(id: string, patch: Partial<Omit<Connection, 'id' | 'tenantId' | 'ownerId' | 'provider' | 'createdAt' | 'updatedAt'>>): Promise<Connection> {
    const [row] = await this.db
      .update(connections)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(connections.id, id))
      .returning();
    return toEntity(row!);
  }

  async listNotUnderKey(keyId: string): Promise<Connection[]> {
    const rows = await this.db.select().from(connections).where(ne(connections.keyId, keyId));
    return rows.map(toEntity);
  }

  async reencrypt(id: string, patch: { secretEnc: string; keyId: string }): Promise<void> {
    await this.db.update(connections).set({ ...patch, updatedAt: new Date() }).where(eq(connections.id, id));
  }
}
