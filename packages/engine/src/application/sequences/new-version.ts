import type { Version } from '../../domain/entities.js';
import { conflict, invalid, notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { TAG_PATTERN } from './shared.js';

/** Copy any version into a new draft with its own tag. */
export async function newVersion(deps: Deps, projectId: string, sequenceId: string, input: { from_version?: string; tag: string; created_by?: string }): Promise<Version> {
  if (!TAG_PATTERN.test(input.tag)) throw invalid('BAD_TAG', 'A tag is up to 24 letters, digits, dots and dashes, like v2.');
  return deps.uow.transaction(async ({ repos }) => {
    const s = await repos.sequences.byId(projectId, sequenceId);
    if (!s) throw notFound('Sequence', sequenceId);
    const all = await repos.sequences.versions(s.id);
    if (all.some((v) => v.tag === input.tag)) throw conflict('TAG_TAKEN', `Version ${input.tag} already exists.`);
    const fromId = input.from_version ?? s.defaultVersionId ?? all[all.length - 1]?.id;
    const from = fromId ? all.find((v) => v.id === fromId) : undefined;
    if (!from) throw notFound('Version', fromId ?? '');
    return repos.sequences.createVersion({
      id: deps.ids.next('version'),
      projectId,
      sequenceId: s.id,
      tag: input.tag,
      status: 'draft',
      definition: from.definition,
      schemaVersion: from.schemaVersion,
      lockVersion: 0,
      basedOnVersionId: from.id,
      createdBy: input.created_by ?? null,
      publishedBy: null,
      publishedAt: null,
      archivedAt: null,
    });
  });
}
