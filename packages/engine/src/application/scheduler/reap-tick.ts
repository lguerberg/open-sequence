/**
 * The reaper (docs section 3.1): everything a crash can leave behind. Planner claims nobody
 * advanced, runs recorded but never queued, runs no executor finished, and deliveries whose
 * message was lost. Each sweep is bounded so one tick never runs away.
 */
import type { Deps } from '../deps.js';
import { failRun, queueFor } from '../execution/shared.js';
import { HOUR_MS, MINUTE_MS, requeueDueDeliveries } from './shared.js';

export interface ReapSummary {
  releasedClaims: number;
  requeuedRuns: number;
  failedStuck: number;
  requeuedDeliveries: number;
}

export async function reapTick(deps: Deps): Promise<ReapSummary> {
  const now = deps.clock.now();
  const repos = deps.uow.repos;

  const releasedClaims = await repos.enrollments.releaseStaleClaims(new Date(now.getTime() - 10 * MINUTE_MS));

  let requeuedRuns = 0;
  for (const run of await repos.runs.runningWithoutMessage(new Date(now.getTime() - 2 * MINUTE_MS), 200)) {
    try {
      if (!run.channel) {
        await failRun(deps, run, 'running run has no channel to queue on', now);
        continue;
      }
      await deps.queue.send(queueFor(run.channel), { v: 1, run_id: run.id });
      await repos.runs.update(run.id, { enqueuedAt: now });
      requeuedRuns++;
    } catch (err) {
      deps.log.error({ runId: run.id, enrollmentId: run.enrollmentId, err }, `re-enqueue failed for run ${run.id}`);
    }
  }

  let failedStuck = 0;
  for (const run of await repos.runs.stuck('running', new Date(now.getTime() - 2 * HOUR_MS), 200)) {
    try {
      await failRun(deps, run, 'stuck', now);
      failedStuck++;
    } catch (err) {
      deps.log.error({ runId: run.id, enrollmentId: run.enrollmentId, err }, `failing stuck run ${run.id} failed`);
    }
  }

  const requeuedDeliveries = await requeueDueDeliveries(deps, new Date(now.getTime() - 2 * MINUTE_MS), 500);
  return { releasedClaims, requeuedRuns, failedStuck, requeuedDeliveries };
}
