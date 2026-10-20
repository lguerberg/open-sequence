/**
 * Test doubles for building a Deps against the throwaway Postgres: an in-memory queue, providers
 * that fail loudly unless a test overrides them, a secrets port that only base64-encodes, and a
 * webhook transport that records what it was asked to post. Tests share the database with other
 * files, so they use their own project rows and never truncate.
 */
import type { ProviderSet, Queue, QueueMessage } from '@opensequence/core';
import { DEFAULT_CONFIG, type Deps, type Logger, type SecretsPort, type WebhookTransport } from '../application/deps.js';
import { systemClock, type Clock } from '../domain/shared/clock.js';
import { ulidIds } from '../infrastructure/id-generator.js';
import { DrizzleUnitOfWork } from '../infrastructure/persistence/unit-of-work.js';
import { testDb } from './db.js';

export class MemoryQueue implements Queue {
  messages: Array<QueueMessage & { visibleAt: number; archived?: string }> = [];
  private seq = 0;

  async send(queue: string, payload: unknown, opts: { delayMs?: number } = {}): Promise<void> {
    this.messages.push({ id: String(++this.seq), queue, payload, readCount: 0, visibleAt: Date.now() + (opts.delayMs ?? 0) });
  }
  async read(queue: string, opts: { visibilityTimeoutMs: number; count: number }): Promise<QueueMessage[]> {
    const now = Date.now();
    const ready = this.messages.filter((m) => m.queue === queue && !m.archived && m.visibleAt <= now).slice(0, opts.count);
    for (const m of ready) {
      m.readCount++;
      m.visibleAt = now + opts.visibilityTimeoutMs;
    }
    return ready.map(({ id, queue: q, payload, readCount }) => ({ id, queue: q, payload, readCount }));
  }
  async delete(id: string): Promise<void> {
    this.messages = this.messages.filter((m) => m.id !== id);
  }
  async archive(id: string, reason: string): Promise<void> {
    const m = this.messages.find((x) => x.id === id);
    if (m) m.archived = reason;
  }
  async release(id: string, delayMs: number): Promise<void> {
    const m = this.messages.find((x) => x.id === id);
    if (m) m.visibleAt = Date.now() + delayMs;
  }
  async stats(): Promise<Array<{ queue: string; depth: number; oldestMs: number | null }>> {
    return [];
  }
  /** Every live message on a queue, in send order. */
  on(queue: string): QueueMessage[] {
    return this.messages.filter((m) => m.queue === queue && !m.archived);
  }
}

export const noopLogger: Logger = { info() {}, warn() {}, error() {}, debug() {} };

/** Not encryption: enough to prove the use cases round-trip through the port. */
export const base64Secrets: SecretsPort = {
  async encrypt(plain) {
    return { ciphertext: Buffer.from(plain, 'utf8').toString('base64'), keyId: 'test' };
  },
  async decrypt(ciphertext) {
    return Buffer.from(ciphertext, 'base64').toString('utf8');
  },
};

const unexpected = (what: string) => async (): Promise<never> => {
  throw new Error(`unexpected provider call: ${what}`);
};

export function stubProviders(overrides: Partial<ProviderSet> = {}): ProviderSet {
  return {
    email: { send: unexpected('email.send'), findSent: async () => null, health: async () => 'active', ...overrides.email },
    sms: { send: unexpected('sms.send'), findSent: async () => null, verifyWebhook: async () => [], listNumbers: async () => [], listUsers: async () => [], health: async () => 'active', ...overrides.sms },
    dialer: { pushNumbers: async () => ({ added: 0, skipped: [] }), ...overrides.dialer },
    crm: { schema: async () => ({ objects: [] }), lookup: async () => ({ person: null, company: null, deal: null, openDeals: 0 }), ...overrides.crm },
  };
}

export interface RecordedPost {
  url: string;
  body: string;
  headers: Record<string, string>;
  timeoutMs: number;
}

/** Answers every POST with the next scripted response (the last one repeats) and keeps what it saw. */
export class RecordingTransport implements WebhookTransport {
  posts: RecordedPost[] = [];
  constructor(private responses: Array<{ status: number; error?: string }> = [{ status: 200 }]) {}
  async post(url: string, body: string, headers: Record<string, string>, timeoutMs: number): Promise<{ status: number; error?: string }> {
    this.posts.push({ url, body, headers, timeoutMs });
    const next = this.responses.length > 1 ? this.responses.shift()! : this.responses[0]!;
    return next;
  }
}

export interface TestDeps extends Deps {
  queue: MemoryQueue;
  webhookTransport: RecordingTransport;
}

export function makeTestDeps(opts: { clock?: Clock; providers?: Partial<ProviderSet>; transport?: RecordingTransport } = {}): TestDeps {
  const queue = new MemoryQueue();
  const clock = opts.clock ?? systemClock;
  const webhookTransport = opts.transport ?? new RecordingTransport();
  return {
    uow: new DrizzleUnitOfWork(testDb(), ulidIds, clock, queue, true),
    queue,
    providers: stubProviders(opts.providers),
    ids: ulidIds,
    clock,
    log: noopLogger,
    secrets: base64Secrets,
    webhookTransport,
    config: { ...DEFAULT_CONFIG, disabledChannels: new Set() },
  };
}
