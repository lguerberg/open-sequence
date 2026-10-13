import { describe, expect, it } from 'vitest';
import { MemoryQueue } from './memory-queue.js';
import { queueConformance } from './test/conformance.js';

const shared = new MemoryQueue();

queueConformance('MemoryQueue', {
  queue: () => shared,
  findDead: async (id) => {
    const d = shared.dead().find((x) => x.id === id);
    return d && { queue: d.queue, reason: d.reason, readCount: d.readCount };
  },
});

describe('MemoryQueue', () => {
  it('hands out copies of the payload, never the stored object', async () => {
    const q = new MemoryQueue();
    const payload = { v: 1, nested: { a: 1 } };
    await q.send('q', payload);
    payload.nested.a = 2;
    const [m] = await q.read('q', { visibilityTimeoutMs: 1000, count: 1 });
    expect(m!.payload).toEqual({ v: 1, nested: { a: 1 } });
    (m!.payload as { nested: { a: number } }).nested.a = 3;
    await q.release(m!.id, 0);
    const [again] = await q.read('q', { visibilityTimeoutMs: 1000, count: 1 });
    expect(again!.payload).toEqual({ v: 1, nested: { a: 1 } });
  });

  it('ignores tx on send', async () => {
    const q = new MemoryQueue();
    await q.send('q', { v: 1 }, { tx: { execute: () => Promise.reject(new Error('must not be called')) } });
    expect(await q.read('q', { visibilityTimeoutMs: 1000, count: 1 })).toHaveLength(1);
  });

  it('works with an injected clock', async () => {
    let t = 1_000_000;
    const q = new MemoryQueue(() => t);
    await q.send('q', { v: 1 }, { delayMs: 500 });
    expect(await q.read('q', { visibilityTimeoutMs: 100, count: 1 })).toEqual([]);
    t += 500;
    const [m] = await q.read('q', { visibilityTimeoutMs: 100, count: 1 });
    expect(m).toBeDefined();
    t += 99;
    expect(await q.read('q', { visibilityTimeoutMs: 100, count: 1 })).toEqual([]);
    t += 1;
    expect((await q.read('q', { visibilityTimeoutMs: 100, count: 1 }))[0]!.readCount).toBe(2);
  });
});
