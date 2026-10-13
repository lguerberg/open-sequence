/**
 * The job table (docs section 3.1). The composition root ticks each job on its period and calls
 * `runJob(deps, name, ttlMs, () => fn(deps))`; the lease row decides which replica runs it. A TTL
 * is a few periods long, so a dead leader is replaced quickly and a slow tick rarely overlaps.
 */
import type { Deps } from '../deps.js';
import { planTick } from './plan-tick.js';
import { pollTick } from './poll-tick.js';
import { reapTick } from './reap-tick.js';
import { retentionTick } from './retention-tick.js';
import { DAY_MS, HOUR_MS, MINUTE_MS } from './shared.js';
import { signalsTick } from './signals-tick.js';
import { webhooksTick } from './webhooks-tick.js';

export interface JobSpec {
  periodMs: number;
  ttlMs: number;
  /** Resolves to a small summary of counts that runJob adds to its log line. */
  fn: (deps: Deps) => Promise<object>;
}

export const JOBS: Readonly<Record<string, JobSpec>> = {
  plan: { periodMs: 5_000, ttlMs: 20_000, fn: planTick },
  signals: { periodMs: 30_000, ttlMs: 2 * MINUTE_MS, fn: signalsTick },
  poll: { periodMs: MINUTE_MS, ttlMs: 5 * MINUTE_MS, fn: pollTick },
  reap: { periodMs: MINUTE_MS, ttlMs: 5 * MINUTE_MS, fn: reapTick },
  retention: { periodMs: DAY_MS, ttlMs: HOUR_MS, fn: retentionTick },
  webhooks: { periodMs: 30_000, ttlMs: 2 * MINUTE_MS, fn: webhooksTick },
};
