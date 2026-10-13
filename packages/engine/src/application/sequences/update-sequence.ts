import type { Sequence } from '../../domain/entities.js';
import { conflict } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { resolveSequence } from './resolve-sequence.js';

export interface SequencePatch {
  name?: string;
  description?: string | null;
  labels?: Record<string, unknown>;
  status?: 'active' | 'paused' | 'archived';
  /** Archiving with active enrollments is refused unless this is true; then they exit with reason `manual`. */
  exit_active?: boolean;
}

export async function updateSequence(deps: Deps, projectId: string, idOrExternal: string, patch: SequencePatch): Promise<Sequence> {
  const s = await resolveSequence(deps, projectId, idOrExternal);
  return deps.uow.transaction(async ({ repos, raise }) => {
    if (patch.status === 'archived') {
      const active = await repos.sequences.countActiveEnrollments(s.id);
      if (active > 0 && !patch.exit_active) {
        throw conflict('HAS_ACTIVE_ENROLLMENTS', `${active} contacts are still in this sequence. Exit them first, or send exit_active: true.`, { active });
      }
      if (active > 0) {
        const page = await repos.enrollments.list(projectId, { sequenceId: s.id }, { limit: 10_000 });
        for (const e of page.items) {
          if (!['active', 'paused', 'waiting_limit'].includes(e.status)) continue;
          await repos.enrollments.update(e.id, { status: 'exited', exitReason: 'manual', finishedAt: deps.clock.now(), nextRunAt: null, ownerRunId: null, waiting: null });
          raise({ type: 'enrollment.exited', projectId, enrollmentId: e.id, payload: { enrollment: e.id, contact: { id: e.contactId }, exit_reason: 'manual', label: 'sequence archived' } });
        }
      }
    }
    const update: Parameters<typeof repos.sequences.update>[2] = {};
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.description !== undefined) update.description = patch.description;
    if (patch.labels !== undefined) update.labels = patch.labels;
    if (patch.status !== undefined) update.status = patch.status;
    return repos.sequences.update(projectId, s.id, update);
  });
}
