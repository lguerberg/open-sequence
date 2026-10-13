/**
 * Runs one periodic job under its lease row (docs section 3.1). Whichever replica takes the lease
 * runs the job; the others skip this tick. The lease is released by markRan, so a crashed leader
 * is replaced when the TTL passes; a job that overruns its TTL may overlap with a new leader, which
 * every job tolerates.
 */
import { hostname } from 'node:os';
import type { Deps } from '../deps.js';

export type JobResult = 'ran' | 'skipped' | 'failed';

export async function runJob(deps: Deps, name: string, ttlMs: number, fn: () => Promise<unknown>): Promise<JobResult> {
  const scheduler = deps.uow.repos.scheduler;
  const holder = `${hostname()}:${process.pid}`;
  if (!(await scheduler.acquire(name, holder, ttlMs, deps.clock.now()))) return 'skipped';
  const started = Date.now();
  try {
    const summary = await fn();
    deps.log.info({ job: name, holder, durationMs: Date.now() - started, ...(summary && typeof summary === 'object' ? summary : {}) }, `job ${name} ran`);
    return 'ran';
  } catch (err) {
    deps.log.error({ job: name, holder, durationMs: Date.now() - started, err }, `job ${name} failed`);
    return 'failed';
  } finally {
    await scheduler.markRan(name, deps.clock.now()).catch((err: unknown) => deps.log.warn({ job: name, err }, `job ${name}: lease not released`));
  }
}
