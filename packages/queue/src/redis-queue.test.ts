/**
 * Needs a Redis: set REDIS_URL (for example redis://127.0.0.1:6379/15) to run; skipped otherwise.
 * Keys live under a per-run prefix so nothing else in that Redis is touched.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { RedisQueue } from './redis-queue.js';
import { queueConformance, uniqueQueueName } from './test/conformance.js';

const url = process.env['REDIS_URL'];

describe.skipIf(!url)('RedisQueue (REDIS_URL)', () => {
  const shared = new RedisQueue(url ?? 'redis://127.0.0.1:6379', {
    keyPrefix: `oseq-test:${Date.now()}:`,
  });

  afterAll(async () => {
    await shared.close();
  });

  queueConformance('RedisQueue', {
    queue: () => shared,
    concurrentReaders: true,
    findDead: async (id) => {
      for (const queue of await shared.queueNames()) {
        const d = (await shared.dead(queue)).find((x) => x.id === id);
        if (d) return { queue: d.queue, reason: d.reason, readCount: d.readCount };
      }
      return undefined;
    },
  });

  it('send with tx just enqueues', async () => {
    const queue = uniqueQueueName();
    await shared.send(queue, { v: 1 }, { tx: {} });
    expect(await shared.read(queue, { visibilityTimeoutMs: 1000, count: 1 })).toHaveLength(1);
  });
});
