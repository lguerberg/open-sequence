import { SCHEMA_VERSION, validateDefinition, type ValidationProblem } from '@opensequence/core';
import type { Sequence, Version } from '../../domain/entities.js';
import { invalid } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { zodProblems } from '../projects/shared.js';
import { createSequenceSchema, emptyDraft, type CreateSequenceInput } from './shared.js';

/** Creates the sequence and its `v1` draft (from the given definition or an empty one). Problems are reported, never blocking a draft. */
export async function createSequence(deps: Deps, projectId: string, input: CreateSequenceInput): Promise<{ sequence: Sequence; version: Version; problems: ValidationProblem[] }> {
  const parsed = createSequenceSchema.safeParse(input);
  if (!parsed.success) throw invalid('INVALID_SEQUENCE', zodProblems(parsed.error));
  const d = parsed.data;
  const definition = (d.definition as Record<string, unknown> | undefined) ?? emptyDraft();
  const check = validateDefinition(definition);
  return deps.uow.transaction(async ({ repos }) => {
    const sequence = await repos.sequences.create({
      id: deps.ids.next('sequence'),
      projectId,
      externalId: d.external_id ?? null,
      name: d.name,
      description: d.description ?? null,
      createdBy: d.created_by ?? null,
      labels: d.labels ?? {},
      status: 'active',
      defaultVersionId: null,
    });
    const version = await repos.sequences.createVersion({
      id: deps.ids.next('version'),
      projectId,
      sequenceId: sequence.id,
      tag: 'v1',
      status: 'draft',
      definition,
      schemaVersion: SCHEMA_VERSION,
      lockVersion: 0,
      basedOnVersionId: null,
      createdBy: d.created_by ?? null,
      publishedBy: null,
      publishedAt: null,
      archivedAt: null,
    });
    return { sequence, version, problems: check.problems };
  });
}
