import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, like, lt, lte, or, sql } from 'drizzle-orm';
import type { Enrollment, Run, RunStatus } from '../../../domain/entities.js';
import type { EnrollmentConflict, EnrollmentRepository, ListOptions, Page, RunRepository } from '../../../domain/repositories.js';
import { decodeCursor, page, type DbOrTx } from '../db.js';
import { enrollments, runs } from '../schema.js';

export class DrizzleEnrollmentRepository implements EnrollmentRepository {
  constructor(private readonly db: DbOrTx) {}

  async insertMany(rows: Array<Omit<Enrollment, 'createdAt' | 'updatedAt' | 'seq'>>): Promise<Enrollment[]> {
    if (rows.length === 0) return [];
    return this.db.insert(enrollments).values(rows).returning();
  }

  async byId(id: string): Promise<Enrollment | null> {
    return (await this.db.query.enrollments.findFirst({ where: eq(enrollments.id, id) })) ?? null;
  }

  async lock(id: string): Promise<Enrollment | null> {
    const rows = await this.db.select().from(enrollments).where(eq(enrollments.id, id)).for('update');
    return rows[0] ?? null;
  }

  async activeByContacts(projectId: string, contactIds: string[]): Promise<EnrollmentConflict[]> {
    if (contactIds.length === 0) return [];
    const rows = await this.db
      .select({
        contactId: enrollments.contactId,
        enrollmentId: enrollments.id,
        sequenceId: enrollments.sequenceId,
        versionId: enrollments.versionId,
        senderId: enrollments.senderId,
        status: enrollments.status,
      })
      .from(enrollments)
      .where(and(eq(enrollments.projectId, projectId), inArray(enrollments.contactId, contactIds), inArray(enrollments.status, ['active', 'paused', 'waiting_limit'])));
    return rows;
  }

  async lastBySequenceAndContact(sequenceId: string, contactId: string): Promise<Enrollment | null> {
    return (
      (await this.db.query.enrollments.findFirst({
        where: and(eq(enrollments.sequenceId, sequenceId), eq(enrollments.contactId, contactId)),
        orderBy: desc(enrollments.enrolledAt),
      })) ?? null
    );
  }

  async forSignal(contactId: string, touchedSince: Date): Promise<Enrollment[]> {
    return this.db.query.enrollments.findMany({
      where: and(
        eq(enrollments.contactId, contactId),
        or(inArray(enrollments.status, ['active', 'paused', 'waiting_limit']), and(isNotNull(enrollments.lastTouchAt), gte(enrollments.lastTouchAt, touchedSince)))
      ),
      orderBy: desc(enrollments.lastTouchAt),
    });
  }

  async list(
    projectId: string,
    filter: { sequenceId?: string; versionId?: string; status?: string; senderId?: string; contactId?: string; exitReason?: string },
    opts: ListOptions
  ): Promise<Page<Enrollment>> {
    const cursor = decodeCursor(opts.cursor);
    const rows = await this.db.query.enrollments.findMany({
      where: and(
        eq(enrollments.projectId, projectId),
        filter.sequenceId ? eq(enrollments.sequenceId, filter.sequenceId) : undefined,
        filter.versionId ? eq(enrollments.versionId, filter.versionId) : undefined,
        filter.status ? eq(enrollments.status, filter.status as Enrollment['status']) : undefined,
        filter.senderId ? eq(enrollments.senderId, filter.senderId) : undefined,
        filter.contactId ? eq(enrollments.contactId, filter.contactId) : undefined,
        filter.exitReason ? eq(enrollments.exitReason, filter.exitReason) : undefined,
        cursor ? gt(enrollments.id, cursor) : undefined,
        opts.updatedSince ? gte(enrollments.updatedAt, opts.updatedSince) : undefined
      ),
      orderBy: asc(enrollments.id),
      limit: opts.limit + 1,
    });
    return page(rows, opts.limit);
  }

  async update(id: string, patch: Partial<Omit<Enrollment, 'id' | 'projectId' | 'createdAt'>>): Promise<Enrollment> {
    const [row] = await this.db
      .update(enrollments)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(enrollments.id, id))
      .returning();
    return row!;
  }

  /**
   * Fair claim: up to `perSender` due enrollments per sender, follow-ups first, SKIP LOCKED so
   * several planners never fight. The claim token goes into owner_run_id so a crashed planner's
   * claims are released by the reaper. The lateral join is the one query Drizzle cannot express.
   */
  async claimDue(now: Date, perSender: number, maxTotal: number): Promise<{ token: string; ids: string[] }> {
    const token = `plan_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    // A raw fragment has no column to type the bind, so the Date goes in as text and is cast here.
    const at = sql`${now.toISOString()}::timestamptz`;
    const rows = await this.db.execute<{ id: string }>(sql`
      with claimed as (
        select e.id
        from (select distinct sender_id from seq.enrollments
              where status = 'active' and next_run_at <= ${at} and owner_run_id is null) u
        cross join lateral (
          select id from seq.enrollments e
          where e.sender_id = u.sender_id and e.status = 'active' and e.next_run_at <= ${at} and e.owner_run_id is null
          order by (e.touch_count > 0) desc, e.next_run_at
          limit ${perSender}
          for update skip locked
        ) e
        limit ${maxTotal}
      )
      update seq.enrollments set owner_run_id = ${token}, updated_at = now()
      where id in (select id from claimed)
      returning id
    `);
    return { token, ids: rows.map((r) => r.id) };
  }

  async releaseStaleClaims(olderThan: Date): Promise<number> {
    const rows = await this.db
      .update(enrollments)
      .set({ ownerRunId: null, nextRunAt: new Date(), updatedAt: new Date() })
      .where(and(like(enrollments.ownerRunId, 'plan_%'), lt(enrollments.updatedAt, olderThan)))
      .returning({ id: enrollments.id });
    return rows.length;
  }

  async duePaused(now: Date, limit: number): Promise<Enrollment[]> {
    return this.db.query.enrollments.findMany({
      where: and(eq(enrollments.status, 'paused'), isNotNull(enrollments.pausedUntil), lte(enrollments.pausedUntil, now)),
      limit,
    });
  }

  async countBySequence(sequenceId: string): Promise<Record<string, number>> {
    const rows = await this.db
      .select({ status: enrollments.status, n: count() })
      .from(enrollments)
      .where(eq(enrollments.sequenceId, sequenceId))
      .groupBy(enrollments.status);
    return Object.fromEntries(rows.map((r) => [r.status, r.n]));
  }
}

export class DrizzleRunRepository implements RunRepository {
  constructor(private readonly db: DbOrTx) {}

  async insert(r: Omit<Run, 'createdAt' | 'updatedAt'>): Promise<Run> {
    const [row] = await this.db.insert(runs).values(r).returning();
    return row!;
  }

  async upsertByKey(r: Omit<Run, 'createdAt' | 'updatedAt'>): Promise<Run> {
    const [row] = await this.db
      .insert(runs)
      .values(r)
      .onConflictDoUpdate({
        target: runs.idempotencyKey,
        set: { status: r.status, startedAt: r.startedAt, enqueuedAt: null, error: null, updatedAt: new Date() },
        setWhere: eq(runs.status, 'deferred'),
      })
      .returning();
    if (row) return row;
    // The conflicting run exists and is not deferred: return it untouched.
    return (await this.db.query.runs.findFirst({ where: eq(runs.idempotencyKey, r.idempotencyKey) }))!;
  }

  async byId(id: string): Promise<Run | null> {
    return (await this.db.query.runs.findFirst({ where: eq(runs.id, id) })) ?? null;
  }

  async lock(id: string): Promise<Run | null> {
    const rows = await this.db.select().from(runs).where(eq(runs.id, id)).for('update');
    return rows[0] ?? null;
  }

  async byEnrollment(enrollmentId: string): Promise<Run[]> {
    return this.db.query.runs.findMany({ where: eq(runs.enrollmentId, enrollmentId), orderBy: [asc(runs.createdAt), asc(runs.id)] });
  }

  async update(id: string, patch: Partial<Pick<Run, 'status' | 'startedAt' | 'finishedAt' | 'provider' | 'providerRef' | 'threadRef' | 'branch' | 'result' | 'error' | 'touchNumber' | 'enqueuedAt' | 'attempt'>>): Promise<Run> {
    const [row] = await this.db
      .update(runs)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(runs.id, id))
      .returning();
    return row!;
  }

  async patchResult(id: string, patch: Record<string, unknown>): Promise<void> {
    await this.db
      .update(runs)
      .set({ result: sql`${runs.result} || ${JSON.stringify(patch)}::jsonb`, updatedAt: new Date() })
      .where(eq(runs.id, id));
  }

  async byThreadRef(projectId: string, threadRef: string): Promise<Run | null> {
    return (await this.db.query.runs.findFirst({ where: and(eq(runs.projectId, projectId), eq(runs.threadRef, threadRef)), orderBy: desc(runs.createdAt) })) ?? null;
  }

  async byProviderRef(projectId: string, provider: string, ref: string): Promise<Run | null> {
    return (await this.db.query.runs.findFirst({ where: and(eq(runs.projectId, projectId), eq(runs.provider, provider), eq(runs.providerRef, ref)) })) ?? null;
  }

  async latestTouch(contactId: string, channel: string | null, before: Date): Promise<Run | null> {
    const rows = await this.db
      .select({ run: runs })
      .from(runs)
      .innerJoin(enrollments, eq(enrollments.id, runs.enrollmentId))
      .where(
        and(
          eq(enrollments.contactId, contactId),
          eq(runs.status, 'done'),
          isNotNull(runs.touchNumber),
          channel ? eq(runs.channel, channel) : undefined,
          lte(runs.finishedAt, before)
        )
      )
      .orderBy(desc(runs.finishedAt))
      .limit(1);
    return rows[0]?.run ?? null;
  }

  async stuck(status: RunStatus, olderThan: Date, limit: number): Promise<Run[]> {
    return this.db.query.runs.findMany({ where: and(eq(runs.status, status), lte(runs.startedAt, olderThan)), limit });
  }

  async runningWithoutMessage(olderThan: Date, limit: number): Promise<Run[]> {
    return this.db.query.runs.findMany({ where: and(eq(runs.status, 'running'), sql`${runs.enqueuedAt} is null`, lte(runs.createdAt, olderThan)), limit });
  }

  async countByEnrollmentAndType(enrollmentId: string, nodeType: string, channel?: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(runs)
      .where(and(eq(runs.enrollmentId, enrollmentId), eq(runs.nodeType, nodeType), eq(runs.status, 'done'), channel ? eq(runs.channel, channel) : undefined));
    return row?.n ?? 0;
  }
}
