import type { Sequence } from '../../domain/entities.js';
import { notFound } from '../../domain/shared/errors.js';
import { externalIdOf } from '../../infrastructure/ids.js';
import type { Deps } from '../deps.js';

export async function resolveSequence(deps: Deps, projectId: string, idOrExternal: string): Promise<Sequence> {
  const ext = externalIdOf(idOrExternal);
  const s = ext === null ? await deps.uow.repos.sequences.byId(projectId, idOrExternal) : await deps.uow.repos.sequences.byExternalId(projectId, ext);
  if (!s) throw notFound('Sequence', idOrExternal);
  return s;
}
