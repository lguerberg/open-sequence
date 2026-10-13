/**
 * The queue port. Three calls; every backend (postgres, redis, memory) implements exactly these.
 * The database is the truth and queue messages are hints: a lost or duplicated message costs a
 * delay at most.
 */
export interface QueueMessage<T = unknown> {
  id: string;
  queue: string;
  payload: T;
  /** How many times it has been read, including this one. */
  readCount: number;
}

export interface Queue {
  /** Enqueue; `delayMs` makes it invisible until then (retries and webhook backoff use it). */
  send(queue: string, payload: unknown, opts?: { delayMs?: number; tx?: unknown }): Promise<void>;
  /** Read up to `count` visible messages and hide them for `visibilityTimeoutMs`. */
  read(queue: string, opts: { visibilityTimeoutMs: number; count: number }): Promise<QueueMessage[]>;
  /** Done with it. */
  delete(id: string): Promise<void>;
  /** Give up on it: moved to the dead queue with a reason, kept for inspection and replay. */
  archive(id: string, reason: string): Promise<void>;
  /** Make it visible again later (a retry with backoff). */
  release(id: string, delayMs: number): Promise<void>;
  /** For health: depth and the age of the oldest visible message, per queue. */
  stats(): Promise<Array<{ queue: string; depth: number; oldestMs: number | null }>>;
}
