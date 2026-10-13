import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import type { Message, Signal, Task } from '../../../domain/entities.js';
import type { ListOptions, MessageRepository, Page, SignalRepository, TaskRepository } from '../../../domain/repositories.js';
import { decodeCursor, page, type DbOrTx } from '../db.js';
import { messages, signalEffects, signals, tasks } from '../schema.js';

export class DrizzleMessageRepository implements MessageRepository {
  constructor(private readonly db: DbOrTx) {}

  async insert(m: Message): Promise<Message> {
    const [row] = await this.db.insert(messages).values(m).returning();
    return row as Message;
  }

  async byProviderId(projectId: string, provider: string, providerId: string): Promise<Message | null> {
    return ((await this.db.query.messages.findFirst({ where: and(eq(messages.projectId, projectId), eq(messages.provider, provider), eq(messages.providerId, providerId)) })) as Message | undefined) ?? null;
  }

  async byMessageId(projectId: string, messageId: string): Promise<Message | null> {
    return ((await this.db.query.messages.findFirst({ where: and(eq(messages.projectId, projectId), eq(messages.messageId, messageId)) })) as Message | undefined) ?? null;
  }

  async byContact(contactId: string, limit: number): Promise<Message[]> {
    return (await this.db.query.messages.findMany({ where: eq(messages.contactId, contactId), orderBy: desc(messages.occurredAt), limit })) as Message[];
  }

  async update(id: string, patch: Partial<Pick<Message, 'status' | 'providerId' | 'threadRef' | 'occurredAt'>>): Promise<void> {
    await this.db.update(messages).set(patch).where(eq(messages.id, id));
  }

  async outboundThreadRefs(senderId: string, channel: string, since: Date): Promise<{ threadRefs: string[]; messageIds: string[] }> {
    const rows = await this.db
      .select({ threadRef: messages.threadRef, messageId: messages.messageId })
      .from(messages)
      .where(and(eq(messages.senderId, senderId), eq(messages.channel, channel), eq(messages.direction, 'out'), gte(messages.occurredAt, since)));
    return {
      threadRefs: [...new Set(rows.map((r) => r.threadRef).filter((x): x is string => !!x))],
      messageIds: [...new Set(rows.map((r) => r.messageId).filter((x): x is string => !!x))],
    };
  }
}

export class DrizzleTaskRepository implements TaskRepository {
  constructor(private readonly db: DbOrTx) {}

  async insert(t: Omit<Task, 'createdAt' | 'updatedAt'>): Promise<Task> {
    const [row] = await this.db.insert(tasks).values(t).returning();
    return row!;
  }

  async byId(projectId: string, id: string): Promise<Task | null> {
    return (await this.db.query.tasks.findFirst({ where: and(eq(tasks.projectId, projectId), eq(tasks.id, id)) })) ?? null;
  }

  async byRun(runId: string): Promise<Task | null> {
    return (await this.db.query.tasks.findFirst({ where: eq(tasks.runId, runId) })) ?? null;
  }

  async lock(id: string): Promise<Task | null> {
    const rows = await this.db.select().from(tasks).where(eq(tasks.id, id)).for('update');
    return rows[0] ?? null;
  }

  async list(projectId: string, filter: { senderId?: string; status?: string; kind?: string; contactId?: string }, opts: ListOptions): Promise<Page<Task>> {
    const cursor = decodeCursor(opts.cursor);
    const rows = await this.db.query.tasks.findMany({
      where: and(
        eq(tasks.projectId, projectId),
        filter.senderId ? eq(tasks.senderId, filter.senderId) : undefined,
        filter.status ? eq(tasks.status, filter.status) : undefined,
        filter.kind ? eq(tasks.kind, filter.kind) : undefined,
        filter.contactId ? eq(tasks.contactId, filter.contactId) : undefined,
        cursor ? gt(tasks.id, cursor) : undefined,
        opts.updatedSince ? gte(tasks.updatedAt, opts.updatedSince) : undefined
      ),
      orderBy: asc(tasks.id),
      limit: opts.limit + 1,
    });
    return page(rows, opts.limit);
  }

  async update(id: string, patch: Partial<Pick<Task, 'status' | 'outcome' | 'note' | 'completedAt' | 'dialerPushedAt'>>): Promise<Task> {
    const [row] = await this.db
      .update(tasks)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return row!;
  }

  async expired(now: Date, limit: number): Promise<Task[]> {
    return this.db.query.tasks.findMany({ where: and(eq(tasks.status, 'open'), isNotNull(tasks.expiresAt), lte(tasks.expiresAt, now)), limit });
  }

  async openCall(senderId: string, contactId: string): Promise<Task | null> {
    return (
      (await this.db.query.tasks.findFirst({
        where: and(eq(tasks.senderId, senderId), eq(tasks.contactId, contactId), eq(tasks.kind, 'call'), eq(tasks.status, 'open')),
        orderBy: asc(tasks.createdAt),
      })) ?? null
    );
  }

  async openDialerTasks(senderId: string): Promise<Task[]> {
    return this.db.query.tasks.findMany({ where: and(eq(tasks.senderId, senderId), eq(tasks.status, 'open'), eq(tasks.dialer, true), isNotNull(tasks.dialerPushedAt)) });
  }

  async openUnpushedDialerTasks(limit: number): Promise<Task[]> {
    return this.db.query.tasks.findMany({
      where: and(eq(tasks.status, 'open'), eq(tasks.dialer, true), isNull(tasks.dialerPushedAt)),
      orderBy: asc(tasks.createdAt),
      limit,
    });
  }

  async latestForContact(contactId: string): Promise<Task | null> {
    return (await this.db.query.tasks.findFirst({ where: and(eq(tasks.contactId, contactId), inArray(tasks.status, ['done', 'expired'])), orderBy: desc(tasks.completedAt) })) ?? null;
  }

  async countForContactSince(contactId: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(tasks)
      .where(and(eq(tasks.contactId, contactId), gte(tasks.createdAt, since)));
    return row?.n ?? 0;
  }
}

export class DrizzleSignalRepository implements SignalRepository {
  constructor(private readonly db: DbOrTx) {}

  async insertIfNew(s: Omit<Signal, 'receivedAt' | 'processedAt' | 'attributedRunId' | 'attribution'>): Promise<{ signal: Signal; created: boolean }> {
    const [row] = await this.db
      .insert(signals)
      .values(s)
      .onConflictDoNothing({ target: [signals.projectId, signals.source, signals.externalId] })
      .returning();
    if (row) return { signal: row as Signal, created: true };
    const existing = await this.db.query.signals.findFirst({ where: and(eq(signals.projectId, s.projectId), eq(signals.source, s.source), eq(signals.externalId, s.externalId)) });
    return { signal: existing as Signal, created: false };
  }

  async byId(id: string): Promise<Signal | null> {
    return ((await this.db.query.signals.findFirst({ where: eq(signals.id, id) })) as Signal | undefined) ?? null;
  }

  async markProcessed(id: string, at: Date): Promise<void> {
    await this.db.update(signals).set({ processedAt: at }).where(eq(signals.id, id));
  }

  async attribute(id: string, runId: string | null, attribution: 'direct' | 'assisted' | 'none'): Promise<void> {
    await this.db.update(signals).set({ attributedRunId: runId, attribution }).where(eq(signals.id, id));
  }

  async unprocessed(olderThan: Date, limit: number): Promise<Signal[]> {
    return (await this.db.query.signals.findMany({ where: and(isNull(signals.processedAt), lte(signals.receivedAt, olderThan)), orderBy: asc(signals.receivedAt), limit })) as Signal[];
  }

  async byContact(contactId: string, limit: number): Promise<Signal[]> {
    return (await this.db.query.signals.findMany({ where: eq(signals.contactId, contactId), orderBy: desc(signals.occurredAt), limit })) as Signal[];
  }

  async hasEffect(signalId: string, enrollmentId: string): Promise<boolean> {
    const row = await this.db.query.signalEffects.findFirst({ where: and(eq(signalEffects.signalId, signalId), eq(signalEffects.enrollmentId, enrollmentId)) });
    return !!row;
  }

  async recordEffect(signalId: string, enrollmentId: string, effect: string, detail: Record<string, unknown>): Promise<void> {
    await this.db.insert(signalEffects).values({ signalId, enrollmentId, effect, detail }).onConflictDoNothing();
  }

  async latestOfKind(contactId: string, kinds: string[], since: Date | null): Promise<Signal | null> {
    return (
      ((await this.db.query.signals.findFirst({
        where: and(eq(signals.contactId, contactId), inArray(signals.kind, kinds as Signal['kind'][]), since ? gte(signals.occurredAt, since) : undefined),
        orderBy: desc(signals.occurredAt),
      })) as Signal | undefined) ?? null
    );
  }
}

export { sql };
