import type { Enrollment } from '../../domain/entities.js';
import { conflict, notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { enrollmentPayload } from './shared.js';

/** Back to active. A step that was due while paused runs on the next planner tick. */
export async function resumeEnrollment(deps: Deps, projectId: string, enrollmentId: string): Promise<Enrollment> {
  return deps.uow.transaction(async ({ repos, raise }) => {
    const e = await repos.enrollments.lock(enrollmentId);
    if (!e || e.projectId !== projectId) throw notFound('Enrollment', enrollmentId);
    if (e.status === 'active') return e;
    if (e.status !== 'paused' && e.status !== 'waiting_limit') throw conflict('NOT_PAUSED', `This enrollment is ${e.status}.`);
    const now = deps.clock.now();
    const nextRunAt = e.ownerRunId ? null : e.waiting && !e.nextRunAt ? null : e.nextRunAt && e.nextRunAt > now ? e.nextRunAt : now;
    const updated = await repos.enrollments.update(e.id, { status: 'active', pauseReason: null, pausedUntil: null, nextRunAt });
    raise({ type: 'enrollment.resumed', projectId, enrollmentId: e.id, payload: { enrollment: enrollmentPayload(updated) } });
    return updated;
  });
}
