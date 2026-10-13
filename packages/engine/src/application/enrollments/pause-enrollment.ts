import type { Enrollment } from '../../domain/entities.js';
import { conflict, notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { enrollmentPayload } from './shared.js';

/** Pauses planning for one enrollment; a running executor step still finishes, then nothing more happens until resume. */
export async function pauseEnrollment(deps: Deps, projectId: string, enrollmentId: string, input: { reason?: string; until?: Date } = {}): Promise<Enrollment> {
  return deps.uow.transaction(async ({ repos, raise }) => {
    const e = await repos.enrollments.lock(enrollmentId);
    if (!e || e.projectId !== projectId) throw notFound('Enrollment', enrollmentId);
    if (e.status === 'paused') return e;
    if (e.status !== 'active' && e.status !== 'waiting_limit') throw conflict('NOT_ACTIVE', `This enrollment is ${e.status}.`);
    const updated = await repos.enrollments.update(e.id, { status: 'paused', pauseReason: input.reason ?? 'manual', pausedUntil: input.until ?? null });
    raise({ type: 'enrollment.paused', projectId, enrollmentId: e.id, payload: { enrollment: enrollmentPayload(updated), pause_reason: updated.pauseReason, paused_until: updated.pausedUntil?.toISOString() ?? null } });
    return updated;
  });
}
