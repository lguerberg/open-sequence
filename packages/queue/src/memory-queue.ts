/**
 * An in-process queue with the postgres backend's semantics (visibility timeouts as timestamps,
 * a dead list kept in memory) for development and tests. Nothing survives a restart, which is
 * safe because the planner and the reaper rebuild work from the tables on boot. `send` ignores
 * `tx`: there is no transaction to join.
 */
import type { Queue, QueueMessage } from '@opensequence/core';

interface StoredMessage {
  id: number;
  queue: string;
  payload: unknown;
  visibleAt: number;
  readCt: number;
  createdAt: number;
}

export interface DeadMessage {
  id: string;
  queue: string;
  payload: unknown;
  readCount: number;
  reason: string;
  createdAt: Date;
  deadAt: Date;
}

export class MemoryQueue implements Queue {
  private nextId = 1;
  private readonly messages = new Map<number, StoredMessage>();
  private readonly deadList: DeadMessage[] = [];

  constructor(private readonly now: () => number = () => Date.now()) {}

  async send(queue: string, payload: unknown, opts: { delayMs?: number; tx?: unknown } = {}): Promise<void> {
    const at = this.now();
    const id = this.nextId++;
    this.messages.set(id, {
      id,
      queue,
      payload: clone(payload),
      visibleAt: at + Math.max(0, Math.floor(opts.delayMs ?? 0)),
      readCt: 0,
      createdAt: at,
    });
  }

  async read(queue: string, opts: { visibilityTimeoutMs: number; count: number }): Promise<QueueMessage[]> {
    const count = Math.max(0, Math.floor(opts.count));
    if (count === 0) return [];
    const at = this.now();
    const picked: StoredMessage[] = [];
    // Map iteration is insertion order and ids only grow, so this is `order by id`.
    for (const m of this.messages.values()) {
      if (m.queue !== queue || m.visibleAt > at) continue;
      picked.push(m);
      if (picked.length === count) break;
    }
    return picked.map((m) => {
      m.visibleAt = at + Math.max(0, Math.floor(opts.visibilityTimeoutMs));
      m.readCt += 1;
      return { id: String(m.id), queue: m.queue, payload: clone(m.payload), readCount: m.readCt };
    });
  }

  async delete(id: string): Promise<void> {
    this.messages.delete(Number(id));
  }

  async release(id: string, delayMs: number): Promise<void> {
    const m = this.messages.get(Number(id));
    if (m) m.visibleAt = this.now() + Math.max(0, Math.floor(delayMs));
  }

  async archive(id: string, reason: string): Promise<void> {
    const m = this.messages.get(Number(id));
    if (!m) return;
    this.messages.delete(m.id);
    this.deadList.push({
      id: String(m.id),
      queue: m.queue,
      payload: m.payload,
      readCount: m.readCt,
      reason,
      createdAt: new Date(m.createdAt),
      deadAt: new Date(this.now()),
    });
  }

  async stats(): Promise<Array<{ queue: string; depth: number; oldestMs: number | null }>> {
    const at = this.now();
    const byQueue = new Map<string, { depth: number; oldestVisibleAt: number | null }>();
    for (const m of this.messages.values()) {
      const s = byQueue.get(m.queue) ?? { depth: 0, oldestVisibleAt: null };
      s.depth += 1;
      if (m.visibleAt <= at && (s.oldestVisibleAt === null || m.visibleAt < s.oldestVisibleAt)) s.oldestVisibleAt = m.visibleAt;
      byQueue.set(m.queue, s);
    }
    return [...byQueue.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([queue, s]) => ({ queue, depth: s.depth, oldestMs: s.oldestVisibleAt === null ? null : at - s.oldestVisibleAt }));
  }

  /** The dead queue, for inspection in tests and the dev server. */
  dead(queue?: string): DeadMessage[] {
    return this.deadList.filter((d) => queue === undefined || d.queue === queue);
  }
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}
