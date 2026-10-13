import { validateDefinition, type ValidationProblem } from '@opensequence/core';
import type { Version } from '../../domain/entities.js';
import { conflict, notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';

/** Saving a draft accepts errors (they are reported); only publishing refuses them. Optimistic lock on `lock_version`. */
export async function saveDraft(deps: Deps, projectId: string, versionId: string, input: { definition: unknown; lock_version: number }): Promise<{ version: Version; problems: ValidationProblem[] }> {
  const v = await deps.uow.repos.sequences.version(projectId, versionId);
  if (!v) throw notFound('Version', versionId);
  if (v.status !== 'draft') throw conflict('VERSION_NOT_EDITABLE', `Version ${v.tag} is ${v.status} and cannot be edited. Create a new version from it.`);
  const check = validateDefinition(input.definition);
  const definition = (input.definition ?? {}) as Record<string, unknown>;
  const result = await deps.uow.repos.sequences.saveDraft(versionId, definition, input.lock_version);
  if (result === 'stale') throw conflict('STALE_LOCK', 'Someone else saved this draft after you loaded it. Reload and try again.');
  if (result === 'not_editable') throw conflict('VERSION_NOT_EDITABLE', 'This version is no longer a draft.');
  return { version: result, problems: check.problems };
}
