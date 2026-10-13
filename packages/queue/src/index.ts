/**
 * @opensequence/queue: the three implementations of core's Queue port (docs/ARCHITECTURE.md 15.2).
 * The database is the truth and queue messages are hints, so any backend may lose a message and
 * the system only pays a delay.
 */
import type { Queue } from '@opensequence/core';
import type { Redis } from 'ioredis';
import { PostgresQueue, type QueueDb } from './postgres-queue.js';
import { MemoryQueue } from './memory-queue.js';
import { RedisQueue, type RedisQueueOptions } from './redis-queue.js';

export { PostgresQueue, type QueueDb } from './postgres-queue.js';
export { MemoryQueue, type DeadMessage } from './memory-queue.js';
export { RedisQueue, type RedisQueueOptions } from './redis-queue.js';

export type QueueKind = 'postgres' | 'redis' | 'memory';

export interface CreateQueueOptions {
  /** A Drizzle handle on the seq schema; required for `postgres`. */
  db?: QueueDb;
  /** An ioredis client or a connection URL (SEQ_REDIS_DSN); required for `redis`. */
  redis?: Redis | string;
  redisKeyPrefix?: string;
}

/** Whether `send(..., { tx })` joins a Drizzle transaction, which the engine's unit of work asks about. */
export function queueJoinsTransaction(kind: QueueKind): boolean {
  return kind === 'postgres';
}

export function createQueue(kind: QueueKind, opts: CreateQueueOptions = {}): Queue {
  switch (kind) {
    case 'postgres':
      if (!opts.db) throw new Error('The postgres queue needs a database handle (opts.db).');
      return new PostgresQueue(opts.db);
    case 'redis': {
      if (!opts.redis) throw new Error('The redis queue needs an ioredis client or a connection URL (opts.redis, from SEQ_REDIS_DSN).');
      const redisOpts: RedisQueueOptions = {};
      if (opts.redisKeyPrefix !== undefined) redisOpts.keyPrefix = opts.redisKeyPrefix;
      return new RedisQueue(opts.redis, redisOpts);
    }
    case 'memory':
      return new MemoryQueue();
    default:
      throw new Error(`Unknown queue backend "${String(kind)}"; SEQ_QUEUE must be postgres, redis or memory.`);
  }
}
