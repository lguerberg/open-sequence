import { and, asc, count, eq, gt, gte, max } from 'drizzle-orm';
import type { Sender, SenderChannel } from '../../../domain/entities.js';
import type { ListOptions, Page, SenderRepository } from '../../../domain/repositories.js';
import { decodeCursor, page, type DbOrTx } from '../db.js';
import { messages, senderChannels, senders } from '../schema.js';

export class DrizzleSenderRepository implements SenderRepository {
  constructor(private readonly db: DbOrTx) {}

  async upsertByExternalId(s: Omit<Sender, 'createdAt' | 'updatedAt'>): Promise<Sender> {
    const [row] = await this.db
      .insert(senders)
      .values(s)
      .onConflictDoUpdate({
        target: [senders.projectId, senders.externalId],
        set: { name: s.name, email: s.email, timezone: s.timezone, status: s.status, attrs: s.attrs, signatureHtml: s.signatureHtml, signatureText: s.signatureText, updatedAt: new Date() },
      })
      .returning();
    return row!;
  }

  async byId(projectId: string, id: string): Promise<Sender | null> {
    return (await this.db.query.senders.findFirst({ where: and(eq(senders.projectId, projectId), eq(senders.id, id)) })) ?? null;
  }

  async byExternalId(projectId: string, externalId: string): Promise<Sender | null> {
    return (await this.db.query.senders.findFirst({ where: and(eq(senders.projectId, projectId), eq(senders.externalId, externalId)) })) ?? null;
  }

  async list(projectId: string, opts: ListOptions): Promise<Page<Sender>> {
    const cursor = decodeCursor(opts.cursor);
    const rows = await this.db.query.senders.findMany({
      where: and(eq(senders.projectId, projectId), cursor ? gt(senders.id, cursor) : undefined, opts.updatedSince ? gte(senders.updatedAt, opts.updatedSince) : undefined),
      orderBy: asc(senders.id),
      limit: opts.limit + 1,
    });
    return page(rows, opts.limit);
  }

  async setStatus(projectId: string, id: string, status: string): Promise<void> {
    await this.db.update(senders).set({ status, updatedAt: new Date() }).where(and(eq(senders.projectId, projectId), eq(senders.id, id)));
  }

  async channels(senderId: string): Promise<SenderChannel[]> {
    return this.db.query.senderChannels.findMany({ where: eq(senderChannels.senderId, senderId), orderBy: asc(senderChannels.channel) });
  }

  async channel(senderId: string, channel: string): Promise<SenderChannel | null> {
    return (await this.db.query.senderChannels.findFirst({ where: and(eq(senderChannels.senderId, senderId), eq(senderChannels.channel, channel)) })) ?? null;
  }

  async channelById(id: string): Promise<SenderChannel | null> {
    return (await this.db.query.senderChannels.findFirst({ where: eq(senderChannels.id, id) })) ?? null;
  }

  async channelByAddress(projectId: string, channel: string, address: string): Promise<SenderChannel | null> {
    return (
      (await this.db.query.senderChannels.findFirst({
        where: and(eq(senderChannels.projectId, projectId), eq(senderChannels.channel, channel), eq(senderChannels.address, address)),
      })) ?? null
    );
  }

  async upsertChannel(c: Omit<SenderChannel, 'createdAt' | 'updatedAt'>): Promise<SenderChannel> {
    const [row] = await this.db
      .insert(senderChannels)
      .values(c)
      .onConflictDoUpdate({
        target: [senderChannels.senderId, senderChannels.channel],
        set: {
          connectionId: c.connectionId,
          address: c.address,
          status: c.status,
          dailyLimit: c.dailyLimit,
          weeklyLimit: c.weeklyLimit,
          minGapSeconds: c.minGapSeconds,
          optedInAt: c.optedInAt,
          config: c.config,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row!;
  }

  async updateChannel(id: string, patch: Partial<Pick<SenderChannel, 'status' | 'dailyLimit' | 'weeklyLimit' | 'minGapSeconds' | 'optedInAt' | 'config' | 'connectionId'>>): Promise<SenderChannel> {
    const [row] = await this.db.update(senderChannels).set({ ...patch, updatedAt: new Date() }).where(eq(senderChannels.id, id)).returning();
    return row!;
  }

  async deleteChannel(senderId: string, channel: string): Promise<void> {
    await this.db.delete(senderChannels).where(and(eq(senderChannels.senderId, senderId), eq(senderChannels.channel, channel)));
  }

  async listChannels(channel: string, status: string, limit: number): Promise<SenderChannel[]> {
    return this.db.query.senderChannels.findMany({
      where: and(eq(senderChannels.channel, channel), eq(senderChannels.status, status)),
      orderBy: asc(senderChannels.createdAt),
      limit,
    });
  }

  async sentCount(senderId: string, channel: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(messages)
      .where(and(eq(messages.senderId, senderId), eq(messages.channel, channel), eq(messages.direction, 'out'), gte(messages.occurredAt, since)));
    return row?.n ?? 0;
  }

  async lastSentAt(senderId: string, channel: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ at: max(messages.occurredAt) })
      .from(messages)
      .where(and(eq(messages.senderId, senderId), eq(messages.channel, channel), eq(messages.direction, 'out')));
    return row?.at ?? null;
  }
}
