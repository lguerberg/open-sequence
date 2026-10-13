import { validateDefinition, type ValidationProblem } from '@opensequence/core';
import type { Version } from '../../domain/entities.js';
import { conflict, DomainError, notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';

/** Validate (errors block), freeze the definition, make it the sequence's default. Idempotent on an already published version. */
export async function publishVersion(deps: Deps, projectId: string, versionId: string, by: string | null): Promise<{ version: Version; problems: ValidationProblem[] }> {
  return deps.uow.transaction(async ({ repos }) => {
    const v = await repos.sequences.version(projectId, versionId);
    if (!v) throw notFound('Version', versionId);
    if (v.status === 'published') return { version: v, problems: [] };
    if (v.status !== 'draft') throw conflict('VERSION_NOT_EDITABLE', `Version ${v.tag} is ${v.status}.`);
    const check = validateDefinition(v.definition);
    if (!check.ok) throw new DomainError('INVALID_DEFINITION', 'The definition has errors; fix them before publishing.', 422, { problems: check.problems });
    const published = await repos.sequences.publish(versionId, by, deps.clock.now());
    await repos.sequences.update(projectId, v.sequenceId, { defaultVersionId: versionId });
    return { version: published, problems: check.problems };
  });
}
