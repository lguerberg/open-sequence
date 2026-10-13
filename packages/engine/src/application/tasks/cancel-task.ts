/**
 * Cancels an open task without an outcome: the waiting run closes on `no_answer` and the flow takes
 * the task's `no_answer` branch, or completes. The client sees it as `task.expired`.
 */
import type { Enrollment, Task } from '../../domain/entities.js';
import { notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { advanceEnrollment } from '../enrollments/advance-enrollment.js';
import { finishEnrollment, taskPayload } from '../enrollments/shared.js';

export async function cancelTask(deps: Deps, projectId: string, taskId: string): Promise<Task> {
  const now = deps.clock.now();
  let advance = false;
  const task = await deps.uow.transaction(async (scope) => {
    const { repos } = scope;
    const t = await repos.tasks.lock(taskId);
    if (!t || t.projectId !== projectId) throw notFound('Task', taskId);
    if (t.status !== 'open') return t;
    const cancelled = await repos.tasks.update(t.id, { status: 'cancelled', completedAt: now });

    const e = await repos.enrollments.lock(t.enrollmentId);
    if (e && e.waiting?.runId === t.runId) {
      await repos.runs.update(t.runId, { status: 'done', branch: 'no_answer', finishedAt: now });
      const patch: Partial<Enrollment> = { waiting: null };
      if (t.onExpired) {
        patch.currentNodeId = t.onExpired;
        patch.nextRunAt = now;
        advance = true;
      } else {
        finishEnrollment(scope, e, patch, 'completed', null, now);
      }
      await repos.enrollments.update(e.id, patch);
    }

    scope.raise({ type: 'task.expired', projectId, enrollmentId: t.enrollmentId, payload: { task: taskPayload(cancelled) } });
    return cancelled;
  });
  if (advance) await advanceEnrollment(deps, task.enrollmentId);
  return task;
}
