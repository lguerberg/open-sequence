import type { Version } from '../../domain/entities.js';
import { notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';

/** Stops new enrollments into this version; contacts already in it finish. */
export async function archiveVersion(deps: Deps, projectId: string, versionId: string): Promise<Version> {
  return deps.uow.transaction(async ({ repos }) => {
    const v = await repos.sequences.version(projectId, versionId);
    if (!v) throw notFound('Version', versionId);
    if (v.status === 'archived') return v;
    const archived = await repos.sequences.archiveVersion(versionId, deps.clock.now());
    const s = await repos.sequences.byId(projectId, v.sequenceId);
    if (s?.defaultVersionId === versionId) await repos.sequences.update(projectId, s.id, { defaultVersionId: null });
    return archived;
  });
}
