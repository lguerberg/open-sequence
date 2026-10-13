/**
 * Runs against the throwaway Postgres other packages' tests share (SEQ_TEST_DB_DSN), with the
 * tables the engine's migrations create. Nothing is truncated; every test uses its own queue name.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { closeTestDb, migrateTestDb, testDb } from '../../engine/src/test/db.js';
import { PostgresQueue } from './postgres-queue.js';
import { queueConformance, uniqueQueueName } from './test/conformance.js';

beforeAll(async () => {
  await migrateTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

queueConformance('PostgresQueue', {
  queue: () => new PostgresQueue(testDb()),
  concurrentReaders: true,
  findDead: async (id) => {
    const rows = await testDb().execute(sql`select queue, reason, read_ct from seq.queue_dead where id = ${id}::bigint`);
    const r = rows[0] as { queue: string; reason: string | null; read_ct: number } | undefined;
    return r && { queue: r.queue, reason: r.reason, readCount: Number(r.read_ct) };
  },
});

describe('PostgresQueue', () => {
  it('send with a Drizzle transaction joins it: a rollback leaves nothing queued', async () => {
    const db = testDb();
    const q = new PostgresQueue(db);
    const queue = uniqueQueueName();

    await expect(
      db.transaction(async (tx) => {
        await q.send(queue, { v: 1 }, { tx });
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(await q.read(queue, { visibilityTimeoutMs: 1000, count: 10 })).toEqual([]);

    await db.transaction(async (tx) => {
      await q.send(queue, { v: 2 }, { tx });
      // Not visible to the pool before commit.
      expect(await q.read(queue, { visibilityTimeoutMs: 1000, count: 10 })).toEqual([]);
    });
    const after = await q.read(queue, { visibilityTimeoutMs: 1000, count: 10 });
    expect(after.map((m) => m.payload)).toEqual([{ v: 2 }]);
  });

  it('archive keeps created_at and read_ct and is idempotent', async () => {
    const db = testDb();
    const q = new PostgresQueue(db);
    const queue = uniqueQueueName();
    await q.send(queue, { v: 1 });
    const [m] = await q.read(queue, { visibilityTimeoutMs: 1000, count: 1 });
    await q.archive(m!.id, 'first');
    await q.archive(m!.id, 'second');
    const rows = await db.execute(sql`select reason, read_ct, created_at, dead_at from seq.queue_dead where id = ${m!.id}::bigint`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reason: 'first', read_ct: 1 });
    // Raw execute returns timestamps as text; both must be set and the dead one not earlier.
    const createdAt = new Date(String(rows[0]!['created_at']));
    const deadAt = new Date(String(rows[0]!['dead_at']));
    expect(Number.isNaN(createdAt.getTime())).toBe(false);
    expect(deadAt.getTime()).toBeGreaterThanOrEqual(createdAt.getTime());
  });
});
