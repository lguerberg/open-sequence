/**
 * The redis backend, for installs that want more throughput than one Postgres table gives.
 *
 * Layout (all under `keyPrefix`, default `oseq:`):
 *   q:<queue>      sorted set, member = id, score = visible_at (ms since epoch)
 *   m:<id>         hash: queue, payload (JSON), read_ct, created_at
 *   dead:<queue>   list of JSON dead messages, oldest first
 *   queues         set of every queue name seen, for stats
 *   next_id        counter behind message ids
 *
 * Read is one Lua script, so picking a batch and bumping its visibility is atomic. `send` cannot
 * join a Postgres transaction: it just enqueues, and the engine's reaper re-enqueues anything
 * recorded but not queued.
 */
import { Redis } from 'ioredis';
import type { Queue, QueueMessage } from '@opensequence/core';

const READ_LUA = `
local now = tonumber(ARGV[1])
local ids = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', now, 'LIMIT', 0, tonumber(ARGV[2]))
local out = {}
for i, id in ipairs(ids) do
  local key = ARGV[4] .. id
  if redis.call('EXISTS', key) == 1 then
    redis.call('ZADD', KEYS[1], now + tonumber(ARGV[3]), id)
    local ct = redis.call('HINCRBY', key, 'read_ct', 1)
    local m = redis.call('HMGET', key, 'queue', 'payload')
    out[#out + 1] = { id, m[1], m[2], ct }
  else
    redis.call('ZREM', KEYS[1], id)
  end
end
return out
`;

type ReadRow = [string, string, string, number];

interface RedisWithRead extends Redis {
  oseqRead(zsetKey: string, now: number, count: number, visibilityTimeoutMs: number, messagePrefix: string): Promise<ReadRow[]>;
}

export interface RedisQueueOptions {
  keyPrefix?: string;
  now?: () => number;
}

export class RedisQueue implements Queue {
  private readonly redis: RedisWithRead;
  private readonly prefix: string;
  private readonly now: () => number;
  /** Set when this instance opened the connection, so `close` knows to end it. */
  private readonly owned: boolean;

  constructor(redis: Redis | string, opts: RedisQueueOptions = {}) {
    this.owned = typeof redis === 'string';
    this.redis = (typeof redis === 'string' ? new Redis(redis) : redis) as RedisWithRead;
    this.prefix = opts.keyPrefix ?? 'oseq:';
    this.now = opts.now ?? (() => Date.now());
    if (typeof this.redis.oseqRead !== 'function') {
      this.redis.defineCommand('oseqRead', { numberOfKeys: 1, lua: READ_LUA });
    }
  }

  async send(queue: string, payload: unknown, opts: { delayMs?: number; tx?: unknown } = {}): Promise<void> {
    const at = this.now();
    const id = String(await this.redis.incr(this.key('next_id')));
    await this.redis
      .multi()
      .hset(this.messageKey(id), { queue, payload: JSON.stringify(payload ?? null), read_ct: 0, created_at: at })
      .zadd(this.queueKey(queue), at + Math.max(0, Math.floor(opts.delayMs ?? 0)), id)
      .sadd(this.key('queues'), queue)
      .exec();
  }

  async read(queue: string, opts: { visibilityTimeoutMs: number; count: number }): Promise<QueueMessage[]> {
    const count = Math.max(0, Math.floor(opts.count));
    if (count === 0) return [];
    const rows = await this.redis.oseqRead(
      this.queueKey(queue),
      this.now(),
      count,
      Math.max(0, Math.floor(opts.visibilityTimeoutMs)),
      this.key('m:')
    );
    return rows.map(([id, q, payload, readCt]) => ({
      id,
      queue: q,
      payload: JSON.parse(payload) as unknown,
      readCount: Number(readCt),
    }));
  }

  async delete(id: string): Promise<void> {
    const queue = await this.redis.hget(this.messageKey(id), 'queue');
    if (queue === null) return;
    await this.redis.multi().zrem(this.queueKey(queue), id).del(this.messageKey(id)).exec();
  }

  async release(id: string, delayMs: number): Promise<void> {
    const queue = await this.redis.hget(this.messageKey(id), 'queue');
    if (queue === null) return;
    // XX: only move a member that is still queued; never resurrect a deleted or archived one.
    await this.redis.zadd(this.queueKey(queue), 'XX', this.now() + Math.max(0, Math.floor(delayMs)), id);
  }

  async archive(id: string, reason: string): Promise<void> {
    const m = await this.redis.hgetall(this.messageKey(id));
    if (!m['queue']) return;
    const dead = {
      id,
      queue: m['queue'],
      payload: JSON.parse(m['payload'] ?? 'null') as unknown,
      read_ct: Number(m['read_ct'] ?? 0),
      reason,
      created_at: new Date(Number(m['created_at'] ?? this.now())).toISOString(),
      dead_at: new Date(this.now()).toISOString(),
    };
    await this.redis
      .multi()
      .rpush(this.deadKey(m['queue']), JSON.stringify(dead))
      .zrem(this.queueKey(m['queue']), id)
      .del(this.messageKey(id))
      .exec();
  }

  async stats(): Promise<Array<{ queue: string; depth: number; oldestMs: number | null }>> {
    const queues = (await this.redis.smembers(this.key('queues'))).sort();
    const at = this.now();
    const out: Array<{ queue: string; depth: number; oldestMs: number | null }> = [];
    for (const queue of queues) {
      const [depth, oldest] = await Promise.all([
        this.redis.zcard(this.queueKey(queue)),
        this.redis.zrangebyscore(this.queueKey(queue), '-inf', at, 'WITHSCORES', 'LIMIT', 0, 1),
      ]);
      const score = oldest[1];
      out.push({ queue, depth, oldestMs: score === undefined ? null : Math.max(0, at - Number(score)) });
    }
    return out;
  }

  /** The dead queue, oldest first, for inspection and replay. */
  async dead(queue: string): Promise<Array<{ id: string; queue: string; payload: unknown; readCount: number; reason: string }>> {
    const items = await this.redis.lrange(this.deadKey(queue), 0, -1);
    return items.map((s) => {
      const d = JSON.parse(s) as { id: string; queue: string; payload: unknown; read_ct: number; reason: string };
      return { id: d.id, queue: d.queue, payload: d.payload, readCount: d.read_ct, reason: d.reason };
    });
  }

  /** Ends the connection when this instance opened it from a URL; a shared client is left alone. */
  async close(): Promise<void> {
    if (this.owned) await this.redis.quit();
  }

  private key(suffix: string): string {
    return `${this.prefix}${suffix}`;
  }

  private queueKey(queue: string): string {
    return this.key(`q:${queue}`);
  }

  private messageKey(id: string): string {
    return this.key(`m:${id}`);
  }

  private deadKey(queue: string): string {
    return this.key(`dead:${queue}`);
  }
}
