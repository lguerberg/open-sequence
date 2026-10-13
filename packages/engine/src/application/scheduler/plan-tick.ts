/**
 * The planner (docs section 7.2): claim due enrollments fairly per sender under one token, advance
 * each in its own transaction, then wake the enrollments whose pause has ended. A claim that fails
 * to advance keeps its token and is handed back by the reaper after ten minutes, which is the
 * retry backoff for an enrollment whose advance keeps throwing.
 */
import type { Deps } from '../deps.js';
import { advanceEnrollment } from '../enrollments/advance-enrollment.js';
import { enrollmentPayload } from '../enrollments/shared.js';

export interface PlanSummary {
  claimed: number;
  advanced: number;
  resumed: number;
}

export async function planTick(deps: Deps): Promise<PlanSummary> {
  if (deps.config.paused) return { claimed: 0, advanced: 0, resumed: 0 };
  const now = deps.clock.now();
  const { token, ids } = await deps.uow.transaction(({ repos }) => repos.enrollments.claimDue(now, deps.config.planPerSender, deps.config.planMaxTotal));
  let advanced = 0;
  for (const id of ids) {
    try {
      await advanceEnrollment(deps, id, { claimToken: token });
      advanced++;
    } catch (err) {
      deps.log.error({ enrollmentId: id, claimToken: token, err }, `advance failed for enrollment ${id}`);
    }
  }
  const resumed = await resumeDuePaused(deps, now);
  return { claimed: ids.length, advanced, resumed };
}

/** A pause with `paused_until` in the past ends here; the step that was due runs on the next tick. */
async function resumeDuePaused(deps: Deps, now: Date): Promise<number> {
  const due = await deps.uow.repos.enrollments.duePaused(now, 500);
  let resumed = 0;
  for (const { id } of due) {
    try {
      await deps.uow.transaction(async ({ repos, raise }) => {
        const e = await repos.enrollments.lock(id);
        if (!e || e.status !== 'paused' || !e.pausedUntil || e.pausedUntil > now) return;
        // An executor still owns it, or it waits on an event without a timeout: no timer to set.
        const nextRunAt = e.ownerRunId || (e.waiting && !e.nextRunAt) ? null : now;
        const updated = await repos.enrollments.update(e.id, { status: 'active', pauseReason: null, pausedUntil: null, nextRunAt });
        raise({ type: 'enrollment.resumed', projectId: e.projectId, enrollmentId: e.id, payload: { enrollment: enrollmentPayload(updated), pause_reason: e.pauseReason, paused_until: null } });
        resumed++;
      });
    } catch (err) {
      deps.log.error({ enrollmentId: id, err }, `resume failed for enrollment ${id}`);
    }
  }
  return resumed;
}
