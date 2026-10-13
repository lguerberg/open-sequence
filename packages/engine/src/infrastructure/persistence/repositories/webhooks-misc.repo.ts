import { and, asc, eq, gt, gte, lt, lte, min, sql } from 'drizzle-orm';
import type { WebhookDelivery, WebhookEndpoint } from '../../../domain/entities.js';
import type { IdempotencyRepository, ListOptions, Page, SchedulerRepository, WebhookRepository } from '../../../domain/repositories.js';
import { decodeCursor, page, type DbOrTx } from '../db.js';
import { idempotencyKeys, jobLocks, queueDead, webhookDeliveries, webhookEndpoints } from '../schema.js';

export class DrizzleWebhookRepository implements WebhookRepository {
  constructor(private readonly db: DbOrTx) {}

  async createEndpoint(e: Omit<WebhookEndpoint, 'createdAt' | 'updatedAt' | 'disabledAt' | 'disabledReason'>): Promise<WebhookEndpoint> {
    const [row] = await this.db.insert(webhookEndpoints).values(e).returning();
    return row!;
  }

  async endpoint(projectId: string, id: string): Promise<WebhookEndpoint | null> {
    return (await this.db.query.webhookEndpoints.findFirst({ where: and(eq(webhookEndpoints.projectId, projectId), eq(webhookEndpoints.id, id)) })) ?? null;
  }

  async endpoints(projectId: string): Promise<WebhookEndpoint[]> {
    return this.db.query.webhookEndpoints.findMany({ where: eq(webhookEndpoints.projectId, projectId), orderBy: asc(webhookEndpoints.createdAt) });
  }

  async activeEndpointsFor(projectId: string, eventType: string): Promise<WebhookEndpoint[]> {
    const rows = await this.db.query.webhookEndpoints.findMany({ where: and(eq(webhookEndpoints.projectId, projectId), eq(webhookEndpoints.status, 'active')) });
    return rows.filter((e) => e.eventTypes.includes('*') || e.eventTypes.includes(eventType));
  }

  async updateEndpoint(id: string, patch: Partial<Pick<WebhookEndpoint, 'url' | 'eventTypes' | 'status' | 'disabledReason' | 'disabledAt' | 'secretEnc' | 'keyId'>>): Promise<WebhookEndpoint> {
    const [row] = await this.db
      .update(webhookEndpoints)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(webhookEndpoints.id, id))
      .returning();
    return row!;
  }

  async deleteEndpoint(projectId: string, id: string): Promise<void> {
    await this.db.delete(webhookEndpoints).where(and(eq(webhookEndpoints.projectId, projectId), eq(webhookEndpoints.id, id)));
  }

  async insertDeliveries(rows: Array<Omit<WebhookDelivery, 'createdAt' | 'deliveredAt' | 'attempts' | 'lastStatusCode' | 'lastError'>>): Promise<WebhookDelivery[]> {
    if (rows.length === 0) return [];
    return this.db.insert(webhookDeliveries).values(rows).onConflictDoNothing().returning();
  }

  async delivery(id: string): Promise<WebhookDelivery | null> {
    return (await this.db.query.webhookDeliveries.findFirst({ where: eq(webhookDeliveries.id, id) })) ?? null;
  }

  async lockDelivery(id: string): Promise<WebhookDelivery | null> {
    const rows = await this.db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id)).for('update', { skipLocked: true });
    return rows[0] ?? null;
  }

  async updateDelivery(id: string, patch: Partial<Pick<WebhookDelivery, 'status' | 'attempts' | 'nextAttemptAt' | 'lastStatusCode' | 'lastError' | 'deliveredAt'>>): Promise<void> {
    await this.db.update(webhookDeliveries).set(patch).where(eq(webhookDeliveries.id, id));
  }

  async hasEarlierPending(endpointId: string, enrollmentId: string, before: Date): Promise<boolean> {
    const row = await this.db.query.webhookDeliveries.findFirst({
      where: and(eq(webhookDeliveries.endpointId, endpointId), eq(webhookDeliveries.enrollmentId, enrollmentId), eq(webhookDeliveries.status, 'pending'), lt(webhookDeliveries.createdAt, before)),
    });
    return !!row;
  }

  async due(now: Date, limit: number): Promise<WebhookDelivery[]> {
    return this.db.query.webhookDeliveries.findMany({
      where: and(eq(webhookDeliveries.status, 'pending'), lte(webhookDeliveries.nextAttemptAt, now)),
      orderBy: asc(webhookDeliveries.nextAttemptAt),
      limit,
    });
  }

  async oldestPending(endpointId: string, enrollmentId: string): Promise<WebhookDelivery | null> {
    return (
      (await this.db.query.webhookDeliveries.findFirst({
        where: and(eq(webhookDeliveries.endpointId, endpointId), eq(webhookDeliveries.enrollmentId, enrollmentId), eq(webhookDeliveries.status, 'pending')),
        orderBy: [asc(webhookDeliveries.createdAt), asc(webhookDeliveries.id)],
      })) ?? null
    );
  }

  async heldDeliveries(endpointId: string): Promise<WebhookDelivery[]> {
    return this.db.query.webhookDeliveries.findMany({
      where: and(eq(webhookDeliveries.endpointId, endpointId), eq(webhookDeliveries.status, 'disabled')),
      orderBy: [asc(webhookDeliveries.createdAt), asc(webhookDeliveries.id)],
    });
  }

  async listDeliveries(endpointId: string, opts: ListOptions): Promise<Page<WebhookDelivery>> {
    const cursor = decodeCursor(opts.cursor);
    const rows = await this.db.query.webhookDeliveries.findMany({
      where: and(eq(webhookDeliveries.endpointId, endpointId), cursor ? gt(webhookDeliveries.id, cursor) : undefined),
      orderBy: asc(webhookDeliveries.id),
      limit: opts.limit + 1,
    });
    return page(rows, opts.limit);
  }

  async failedSince(endpointId: string, since: Date): Promise<WebhookDelivery[]> {
    return this.db.query.webhookDeliveries.findMany({
      where: and(eq(webhookDeliveries.endpointId, endpointId), eq(webhookDeliveries.status, 'failed'), gte(webhookDeliveries.createdAt, since)),
      orderBy: asc(webhookDeliveries.createdAt),
    });
  }

  async oldestPendingAge(endpointId: string, now: Date): Promise<number | null> {
    const [row] = await this.db
      .select({ oldest: min(webhookDeliveries.createdAt) })
      .from(webhookDeliveries)
      .where(and(eq(webhookDeliveries.endpointId, endpointId), eq(webhookDeliveries.status, 'pending')));
    return row?.oldest ? now.getTime() - row.oldest.getTime() : null;
  }
}

export class DrizzleIdempotencyRepository implements IdempotencyRepository {
  constructor(private readonly db: DbOrTx) {}

  async get(projectId: string, key: string): Promise<{ requestHash: string; statusCode: number; response: unknown } | null> {
    const row = await this.db.query.idempotencyKeys.findFirst({ where: and(eq(idempotencyKeys.projectId, projectId), eq(idempotencyKeys.key, key)) });
    return row ? { requestHash: row.requestHash, statusCode: row.statusCode, response: row.response } : null;
  }

  async put(projectId: string, key: string, requestHash: string, statusCode: number, response: unknown): Promise<void> {
    await this.db.insert(idempotencyKeys).values({ projectId, key, requestHash, statusCode, response }).onConflictDoNothing();
  }
}

export class DrizzleSchedulerRepository implements SchedulerRepository {
  constructor(private readonly db: DbOrTx) {}

  async acquire(job: string, holder: string, ttlMs: number, now: Date): Promise<boolean> {
    const until = new Date(now.getTime() + ttlMs);
    const rows = await this.db
      .update(jobLocks)
      .set({ lockedUntil: until, holder })
      .where(and(eq(jobLocks.job, job), lt(jobLocks.lockedUntil, now)))
      .returning({ job: jobLocks.job });
    return rows.length > 0;
  }

  async markRan(job: string, at: Date): Promise<void> {
    await this.db.update(jobLocks).set({ lastRunAt: at, lockedUntil: sql`'epoch'` }).where(eq(jobLocks.job, job));
  }

  async lastRuns(): Promise<Record<string, Date | null>> {
    const rows = await this.db.query.jobLocks.findMany();
    return Object.fromEntries(rows.map((r) => [r.job, r.lastRunAt]));
  }

  async purge(input: { idempotencyBefore: Date; deadQueueBefore: Date; deliveredBefore: Date }): Promise<{ idempotencyKeys: number; deadQueue: number; deliveries: number }> {
    const keys = await this.db.delete(idempotencyKeys).where(lt(idempotencyKeys.createdAt, input.idempotencyBefore)).returning({ key: idempotencyKeys.key });
    const dead = await this.db.delete(queueDead).where(lt(queueDead.deadAt, input.deadQueueBefore)).returning({ id: queueDead.id });
    const delivered = await this.db
      .delete(webhookDeliveries)
      .where(and(eq(webhookDeliveries.status, 'delivered'), lt(webhookDeliveries.deliveredAt, input.deliveredBefore)))
      .returning({ id: webhookDeliveries.id });
    return { idempotencyKeys: keys.length, deadQueue: dead.length, deliveries: delivered.length };
  }
}
