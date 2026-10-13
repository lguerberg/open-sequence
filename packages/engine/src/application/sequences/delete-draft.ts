import { conflict, notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';

export async function deleteDraft(deps: Deps, projectId: string, versionId: string): Promise<void> {
  const v = await deps.uow.repos.sequences.version(projectId, versionId);
  if (!v) throw notFound('Version', versionId);
  if (v.status !== 'draft') throw conflict('VERSION_NOT_EDITABLE', 'Only drafts can be deleted.');
  await deps.uow.repos.sequences.deleteDraft(versionId);
}
