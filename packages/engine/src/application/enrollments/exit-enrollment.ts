import type { Enrollment } from '../../domain/entities.js';
import { notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { ACTIVE_STATUSES, finishEnrollment } from './shared.js';

/** Ends an enrollment with reason `manual` and the caller's label. Idempotent on an already finished one. */
export async function exitEnrollment(deps: Deps, projectId: string, enrollmentId: string, input: { reason?: string; label?: string } = {}): Promise<Enrollment> {
  return deps.uow.transaction(async (scope) => {
    const e = await scope.repos.enrollments.lock(enrollmentId);
    if (!e || e.projectId !== projectId) throw notFound('Enrollment', enrollmentId);
    if (!(ACTIVE_STATUSES as readonly string[]).includes(e.status)) return e;
    const patch: Partial<Enrollment> = {};
    finishEnrollment(scope, e, patch, 'exited', input.reason ?? 'manual', deps.clock.now(), input.label ? { label: input.label } : {});
    if (e.waiting) await scope.repos.runs.update(e.waiting.runId, { status: 'done', branch: 'exit', finishedAt: deps.clock.now() });
    return scope.repos.enrollments.update(e.id, patch);
  });
}
