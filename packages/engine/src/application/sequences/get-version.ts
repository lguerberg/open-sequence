import { validateDefinition, type ValidationProblem } from '@opensequence/core';
import type { Version } from '../../domain/entities.js';
import { notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';

/** The definition plus its current validation problems (warnings for a draft, none for a published one). */
export async function getVersion(deps: Deps, projectId: string, versionId: string): Promise<{ version: Version; problems: ValidationProblem[] }> {
  const v = await deps.uow.repos.sequences.version(projectId, versionId);
  if (!v) throw notFound('Version', versionId);
  return { version: v, problems: validateDefinition(v.definition).problems };
}
