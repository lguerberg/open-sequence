/** Sequences: list, read with the definition, validate a definition. */
import type {
  Definition,
  SequenceDetail,
  ValidationProblem,
  VersionSummary,
} from '@opensequence/sdk';
import { z } from 'zod';
import {
  ToolError,
  bullets,
  compact,
  count,
  defineTool,
  lines,
  nextPage,
  paging,
  ref,
} from '../tool.js';

function versionLabel(v: VersionSummary, defaultId: string | null): string {
  return `${v.tag} ${v.status}${v.id === defaultId ? ' (default)' : ''}`;
}

/** The version to show: the one asked for (id or tag), else the default, else the newest. */
function pickVersion(
  detail: SequenceDetail,
  wanted: string | undefined
): VersionSummary | undefined {
  if (wanted) {
    const match = detail.versions.find((v) => v.id === wanted || v.tag === wanted);
    if (!match) {
      const tags = detail.versions.map((v) => v.tag).join(', ') || 'none';
      throw new ToolError(
        'VERSION_NOT_FOUND',
        `Sequence "${detail.name}" has no version "${wanted}". Its versions: ${tags}.`
      );
    }
    return match;
  }
  const byDefault = detail.versions.find((v) => v.id === detail.defaultVersionId);
  if (byDefault) return byDefault;
  return [...detail.versions].sort((a, b) =>
    String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
  )[0];
}

/** `email_intro: outreach email send "Intro email"` for each node of a definition. */
export function describeNodes(definition: Definition): string[] {
  const nodes = (definition['nodes'] ?? {}) as Record<
    string,
    { type?: string; channel?: string; action?: string; params?: { name?: string } }
  >;
  return Object.entries(nodes).map(([id, n]) => {
    const kind = [n.type, n.channel, n.action].filter(Boolean).join(' ');
    return `${id}: ${kind || 'unknown'}${n.params?.name ? ` "${n.params.name}"` : ''}`;
  });
}

export function describeProblems(problems: ValidationProblem[]): string[] {
  return problems.map((p) => `[${p.severity}] ${p.path || '(document)'}: ${p.message} (${p.code})`);
}

export const listSequences = defineTool({
  name: 'list_sequences',
  title: 'List sequences',
  description:
    'Lists the outreach sequences in the project with their versions and how many contacts are in each enrollment status. Use it to find the sequence a person means by name (for example "UK intro") and its id.',
  scope: 'read',
  input: { ...paging },
  async run(client, args) {
    const page = await client.sequences.list(compact({ limit: args.limit, cursor: args.cursor }));
    const rows = page.items.map((s) => {
      const counts = s.counts ?? {};
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const def = s.versions.find((v) => v.id === s.defaultVersionId);
      const ext = s.externalId ? `, external id ${s.externalId}` : '';
      return `${s.name} (${s.id}${ext}): ${s.status}, default version ${def ? def.tag : 'none published'}; ${counts['active'] ?? 0} active of ${total} enrolled`;
    });
    return {
      summary: lines(
        `${count(page.items.length, 'sequence')}.`,
        bullets(rows, 25),
        nextPage(page.nextCursor)
      ),
      data: { items: page.items, next_cursor: page.nextCursor },
    };
  },
});

export const getSequence = defineTool({
  name: 'get_sequence',
  title: 'Get a sequence',
  description:
    "Reads one sequence: its status, every version, and the definition (the steps) of its default version with any validation problems. Pass `version` (an id or a tag like v2) to see another version's definition.",
  scope: 'read',
  input: {
    sequence: ref('sequence', 'seq_01J9…', 'uk-intro'),
    version: z
      .string()
      .optional()
      .describe('A version id (ver_…) or tag (v2) to show instead of the default version.'),
  },
  async run(client, args) {
    const detail = await client.sequences.get(args.sequence);
    const pick = pickVersion(detail, args.version);
    const shown = pick ? await client.sequences.versions.get(detail.id, pick.id) : null;
    const versions =
      detail.versions.map((v) => versionLabel(v, detail.defaultVersionId)).join(', ') || 'none';
    const nodes = shown ? describeNodes(shown.version.definition) : [];
    const entry = shown ? (shown.version.definition['entry'] as string | undefined) : undefined;
    const unpublished =
      shown && !args.version && !detail.defaultVersionId
        ? ' No version is published yet; showing the newest.'
        : '';
    const summary = lines(
      `${detail.name} (${detail.id}) is ${detail.status}. Versions: ${versions}.${unpublished}`,
      shown &&
        `Version ${shown.version.tag} (${shown.version.status}) has ${count(nodes.length, 'step')}${entry ? `, starting at "${entry}"` : ''}:`,
      bullets(nodes, 20),
      shown &&
        (shown.problems.length
          ? `Problems:\n${bullets(describeProblems(shown.problems))}`
          : 'No validation problems.')
    );
    return {
      summary,
      data: { sequence: detail, version: shown?.version ?? null, problems: shown?.problems ?? [] },
    };
  },
});

export const validateSequenceDefinition = defineTool({
  name: 'validate_sequence_definition',
  title: 'Validate a sequence definition',
  description:
    'Checks a sequence definition document (schema_version, entry, settings, exit_on, nodes) without saving it, and returns every problem with its path. Errors block publishing; warnings do not. Use it while drafting or editing steps.',
  scope: 'read',
  input: {
    definition: z
      .record(z.string(), z.unknown())
      .describe(
        'The definition document, as JSON: { schema_version, entry, settings, exit_on, nodes: { <id>: { type, channel?, action?, params, next } } }.'
      ),
  },
  async run(client, args) {
    const result = await client.sequences.validate(args.definition);
    const errors = result.problems.filter((p) => p.severity === 'error').length;
    const warnings = result.problems.length - errors;
    const head = !result.ok
      ? `Not valid: ${count(errors, 'error')} (they block publishing) and ${count(warnings, 'warning')}.`
      : warnings > 0
        ? `Valid, with ${count(warnings, 'warning')}.`
        : 'Valid, no problems.';
    return { summary: lines(head, bullets(describeProblems(result.problems), 20)), data: result };
  },
});
