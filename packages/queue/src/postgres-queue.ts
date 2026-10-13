/**
 * The default queue backend: seq.queue_messages and seq.queue_dead (docs/ARCHITECTURE.md 4.9).
 * Read is one statement, `for update skip locked` so concurrent readers never share a message.
 * `send` runs on the caller's Drizzle transaction when one is given, which is what makes the
 * enqueue a transactional outbox: "run recorded" and "message queued" commit or roll back together.
 *
 * Only `sql` fragments are used, because this package must not import the engine's schema module;
 * the engine's migrations own the tables.
 */
import { sql, type SQL } from 'drizzle-orm';
import type { Queue, QueueMessage } from '@opensequence/core';

/** What we need from a Drizzle handle, structurally: a pool, or a transaction passed as `tx`. */
export interface QueueDb {
  execute(query: SQL): PromiseLike<Iterable<Record<string, unknown>>>;
}

interface MessageRow {
  id: string | number;
  queue: string;
  payload: unknown;
  read_ct: number;
}

interface StatsRow {
  queue: string;
  depth: number | string;
  oldest_ms: number | string | null;
}

function isQueueDb(x: unknown): x is QueueDb {
  return typeof x === 'object' && x !== null && typeof (x as { execute?: unknown }).execute === 'function';
}

export class PostgresQueue implements Queue {
  constructor(private readonly db: QueueDb) {}

  async send(queue: string, payload: unknown, opts: { delayMs?: number; tx?: unknown } = {}): Promise<void> {
    const delayMs = Math.max(0, Math.floor(opts.delayMs ?? 0));
    const db = isQueueDb(opts.tx) ? opts.tx : this.db;
    await db.execute(sql`
      insert into seq.queue_messages (queue, payload, visible_at)
      values (${queue}, ${JSON.stringify(payload)}::jsonb, now() + ${delayMs}::bigint * interval '1 millisecond')
    `);
  }

  async read(queue: string, opts: { visibilityTimeoutMs: number; count: number }): Promise<QueueMessage[]> {
    const count = Math.max(0, Math.floor(opts.count));
    if (count === 0) return [];
    const vt = Math.max(0, Math.floor(opts.visibilityTimeoutMs));
    const rows = await this.db.execute(sql`
      with picked as (
        select id from seq.queue_messages
        where queue = ${queue} and visible_at <= now()
        order by id
        limit ${count}
        for update skip locked
      )
      update seq.queue_messages m
      set visible_at = now() + ${vt}::bigint * interval '1 millisecond', read_ct = m.read_ct + 1
      from picked
      where m.id = picked.id
      returning m.id, m.queue, m.payload, m.read_ct
    `);
    return Array.from(rows as Iterable<MessageRow>, (r) => ({
      id: String(r.id),
      queue: r.queue,
      payload: r.payload,
      readCount: Number(r.read_ct),
    }));
  }

  async delete(id: string): Promise<void> {
    await this.db.execute(sql`delete from seq.queue_messages where id = ${id}::bigint`);
  }

  async release(id: string, delayMs: number): Promise<void> {
    const delay = Math.max(0, Math.floor(delayMs));
    await this.db.execute(sql`
      update seq.queue_messages
      set visible_at = now() + ${delay}::bigint * interval '1 millisecond'
      where id = ${id}::bigint
    `);
  }

  /** One data-modifying CTE, so the move is atomic without a transaction (pooler-safe). */
  async archive(id: string, reason: string): Promise<void> {
    await this.db.execute(sql`
      with moved as (
        delete from seq.queue_messages where id = ${id}::bigint
        returning id, queue, payload, read_ct, created_at
      )
      insert into seq.queue_dead (id, queue, payload, read_ct, reason, created_at)
      select id, queue, payload, read_ct, ${reason}, created_at from moved
      on conflict (id) do nothing
    `);
  }

  /**
   * depth: every message not yet deleted or archived (visible or in flight).
   * oldestMs: how long the oldest visible message has been waiting to be read, null when none is visible.
   */
  async stats(): Promise<Array<{ queue: string; depth: number; oldestMs: number | null }>> {
    const rows = await this.db.execute(sql`
      select queue,
             count(*)::int as depth,
             (extract(epoch from now() - min(visible_at) filter (where visible_at <= now())) * 1000)::bigint as oldest_ms
      from seq.queue_messages
      group by queue
      order by queue
    `);
    return Array.from(rows as Iterable<StatsRow>, (r) => ({
      queue: r.queue,
      depth: Number(r.depth),
      oldestMs: r.oldest_ms === null ? null : Math.max(0, Number(r.oldest_ms)),
    }));
  }
}
