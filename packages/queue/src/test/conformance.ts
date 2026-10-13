/**
 * The behaviour every Queue backend must share, run against each one from its own *.test.ts.
 * A harness gives the queue under test and a way to look into its dead queue; queue names are
 * unique per run because the Postgres suite shares a database with other packages' tests.
 */
import { describe, expect, it } from 'vitest';
import type { Queue } from '@opensequence/core';

export interface DeadRow {
  queue: string;
  reason: string | null;
  readCount: number;
}

export interface QueueHarness {
  queue: () => Queue;
  findDead: (id: string) => Promise<DeadRow | undefined>;
  /** Only backends with real cross-connection locking can prove exclusive delivery. */
  concurrentReaders?: boolean;
}

let seq = 0;
export function uniqueQueueName(): string {
  return `q_${Date.now()}_${process.pid}_${seq++}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function queueConformance(name: string, harness: QueueHarness): void {
  describe(`${name} conforms to the Queue port`, () => {
    it('send then read returns the message once and hides it', async () => {
      const q = harness.queue();
      const queue = uniqueQueueName();
      await q.send(queue, { v: 1, run_id: 'run_1' });

      const first = await q.read(queue, { visibilityTimeoutMs: 30_000, count: 10 });
      expect(first).toHaveLength(1);
      expect(first[0]).toMatchObject({ queue, payload: { v: 1, run_id: 'run_1' }, readCount: 1 });
      expect(typeof first[0]!.id).toBe('string');

      const second = await q.read(queue, { visibilityTimeoutMs: 30_000, count: 10 });
      expect(second).toEqual([]);
    });

    it('release(0) makes it readable again with readCount 2', async () => {
      const q = harness.queue();
      const queue = uniqueQueueName();
      await q.send(queue, { v: 1 });
      const [m] = await q.read(queue, { visibilityTimeoutMs: 30_000, count: 1 });
      expect(m!.readCount).toBe(1);

      await q.release(m!.id, 0);
      const again = await q.read(queue, { visibilityTimeoutMs: 30_000, count: 1 });
      expect(again).toHaveLength(1);
      expect(again[0]!.id).toBe(m!.id);
      expect(again[0]!.readCount).toBe(2);
    });

    it('a short visibility timeout expires on its own', async () => {
      const q = harness.queue();
      const queue = uniqueQueueName();
      await q.send(queue, { v: 1 });
      const [m] = await q.read(queue, { visibilityTimeoutMs: 200, count: 1 });
      expect(await q.read(queue, { visibilityTimeoutMs: 200, count: 1 })).toEqual([]);
      await sleep(300);
      const again = await q.read(queue, { visibilityTimeoutMs: 30_000, count: 1 });
      expect(again.map((x) => x.id)).toEqual([m!.id]);
      expect(again[0]!.readCount).toBe(2);
    });

    it('delete removes it', async () => {
      const q = harness.queue();
      const queue = uniqueQueueName();
      await q.send(queue, { v: 1 });
      const [m] = await q.read(queue, { visibilityTimeoutMs: 30_000, count: 1 });
      await q.delete(m!.id);
      await q.release(m!.id, 0);
      expect(await q.read(queue, { visibilityTimeoutMs: 30_000, count: 10 })).toEqual([]);
      expect((await q.stats()).find((s) => s.queue === queue)).toBeUndefined();
    });

    it('archive moves it to the dead queue with the reason', async () => {
      const q = harness.queue();
      const queue = uniqueQueueName();
      await q.send(queue, { v: 1, run_id: 'run_dead' });
      const [m] = await q.read(queue, { visibilityTimeoutMs: 30_000, count: 1 });
      await q.archive(m!.id, 'max reads exceeded');

      await q.release(m!.id, 0);
      expect(await q.read(queue, { visibilityTimeoutMs: 30_000, count: 10 })).toEqual([]);
      expect(await harness.findDead(m!.id)).toEqual({ queue, reason: 'max reads exceeded', readCount: 1 });
    });

    it('a delayed send is invisible until the delay passes', async () => {
      const q = harness.queue();
      const queue = uniqueQueueName();
      await q.send(queue, { v: 1 }, { delayMs: 300 });
      expect(await q.read(queue, { visibilityTimeoutMs: 30_000, count: 10 })).toEqual([]);
      await sleep(400);
      const after = await q.read(queue, { visibilityTimeoutMs: 30_000, count: 10 });
      expect(after).toHaveLength(1);
      expect(after[0]!.payload).toEqual({ v: 1 });
    });

    it('reads in send order and honours count', async () => {
      const q = harness.queue();
      const queue = uniqueQueueName();
      for (let i = 0; i < 5; i++) await q.send(queue, { i });
      const batch = await q.read(queue, { visibilityTimeoutMs: 30_000, count: 3 });
      expect(batch.map((m) => (m.payload as { i: number }).i)).toEqual([0, 1, 2]);
      const rest = await q.read(queue, { visibilityTimeoutMs: 30_000, count: 10 });
      expect(rest.map((m) => (m.payload as { i: number }).i)).toEqual([3, 4]);
    });

    it('stats reports depth and the age of the oldest visible message', async () => {
      const q = harness.queue();
      const queue = uniqueQueueName();
      await q.send(queue, { v: 1 });
      await q.send(queue, { v: 2 }, { delayMs: 60_000 });
      await sleep(50);

      const s = (await q.stats()).find((x) => x.queue === queue);
      expect(s).toBeDefined();
      expect(s!.depth).toBe(2);
      expect(s!.oldestMs).not.toBeNull();
      expect(s!.oldestMs!).toBeGreaterThanOrEqual(0);
      expect(s!.oldestMs!).toBeLessThan(10_000);

      // Once the visible one is in flight, nothing is visible: depth stays, age goes null.
      await q.read(queue, { visibilityTimeoutMs: 30_000, count: 1 });
      const inFlight = (await q.stats()).find((x) => x.queue === queue);
      expect(inFlight).toEqual({ queue, depth: 2, oldestMs: null });
    });

    if (harness.concurrentReaders) {
      it('two concurrent readers never get the same message', async () => {
        const q = harness.queue();
        const queue = uniqueQueueName();
        const total = 40;
        for (let i = 0; i < total; i++) await q.send(queue, { i });

        const batches = await Promise.all([
          q.read(queue, { visibilityTimeoutMs: 30_000, count: 25 }),
          q.read(queue, { visibilityTimeoutMs: 30_000, count: 25 }),
          q.read(queue, { visibilityTimeoutMs: 30_000, count: 25 }),
        ]);
        const ids = batches.flat().map((m) => m.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toHaveLength(total);
        for (const m of batches.flat()) expect(m.readCount).toBe(1);
      });
    }
  });
}
