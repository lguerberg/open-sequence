/**
 * Completing a task (docs section 7.7): the client, an Allo call.completed webhook or the queue
 * poll names an outcome; the waiting run closes on it, the flow takes branches_by_outcome[outcome]
 * or `completed`, and the signals the outcome implies are recorded. Idempotent: a task that is no
 * longer open is returned unchanged.
 */
import type { Enrollment, Task } from '../../domain/entities.js';
import { invalid, notFound } from '../../domain/shared/errors.js';
import type { TransactionScope } from '../../domain/repositories.js';
import type { Deps } from '../deps.js';
import { advanceEnrollment } from '../enrollments/advance-enrollment.js';
import { finishEnrollment } from '../enrollments/shared.js';
import { recordSignal } from '../signals/record-signal.js';

export type TaskCompletionSource = 'client' | 'allo' | 'poll';

export interface CompleteTaskInput {
  outcome: string;
  note?: string;
}

export async function completeTask(deps: Deps, projectId: string, taskId: string, input: CompleteTaskInput, source: TaskCompletionSource): Promise<Task> {
  const outcome = input.outcome.trim();
  if (!outcome) throw invalid('BAD_OUTCOME', 'Give the outcome of the task, like "connected" or "no_answer".');
  const now = deps.clock.now();
  let advance = false;
  const task = await deps.uow.transaction(async (scope) => {
    const { repos } = scope;
    const t = await repos.tasks.lock(taskId);
    if (!t || t.projectId !== projectId) throw notFound('Task', taskId);
    if (t.status !== 'open') return t;
    const done = await repos.tasks.update(t.id, { status: 'done', outcome, note: input.note ?? null, completedAt: now });

    const e = await repos.enrollments.lock(t.enrollmentId);
    if (e && e.waiting?.runId === t.runId) {
      await repos.runs.update(t.runId, { status: 'done', branch: outcome, finishedAt: now });
      const target = t.branchesByOutcome[outcome] ?? t.onCompleted;
      const patch: Partial<Enrollment> = { waiting: null };
      if (target) {
        patch.currentNodeId = target;
        patch.nextRunAt = now;
        advance = true;
      } else {
        finishEnrollment(scope, e, patch, 'completed', null, now);
      }
      await repos.enrollments.update(e.id, patch);
    }

    await recordOutcomeSignals(deps, scope, done, source, now);
    return done;
  });
  if (advance) await advanceEnrollment(deps, task.enrollmentId);
  return task;
}

/** task_completed always; call_connected, connection_accepted or reply when the kind and outcome say so. */
async function recordOutcomeSignals(deps: Deps, scope: TransactionScope, t: Task, source: string, now: Date): Promise<void> {
  const outcome = t.outcome ?? '';
  const base = { projectId: t.projectId, contactId: t.contactId, source, occurredAt: now };
  await recordSignal(deps, scope, { ...base, kind: 'task_completed', channel: null, externalId: `task:${t.id}`, payload: { run_id: t.runId, outcome, kind: t.kind } });
  if (t.connectedOutcomes.includes(outcome)) {
    await recordSignal(deps, scope, { ...base, kind: 'call_connected', channel: 'call', externalId: `task:${t.id}:connected`, payload: { run_id: t.runId } });
  }
  if (t.kind === 'linkedin_connect' && outcome === 'accepted') {
    await recordSignal(deps, scope, { ...base, kind: 'connection_accepted', channel: 'linkedin', externalId: `task:${t.id}:accepted`, payload: { run_id: t.runId } });
  }
  if (t.kind === 'linkedin_message' && outcome === 'replied') {
    await recordSignal(deps, scope, { ...base, kind: 'reply', channel: 'linkedin', externalId: `task:${t.id}:replied`, payload: { run_id: t.runId } });
  }
}
