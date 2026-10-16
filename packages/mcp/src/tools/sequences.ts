/** Sequences: list, read with the definition, validate a definition, create one, pause or archive it. */
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

/** "No validation problems." or the problems, errors first, with what they mean for publishing. */
export function problemsBlock(problems: ValidationProblem[]): string {
  if (problems.length === 0) return 'No validation problems.';
  const errors = problems.filter((p) => p.severity === 'error').length;
  const warnings = problems.length - errors;
  const head = errors
    ? `${count(errors, 'error')} (they block publishing) and ${count(warnings, 'warning')}:`
    : `${count(warnings, 'warning')} (they do not block publishing):`;
  const sorted = [...problems].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1
  );
  return lines(head, bullets(describeProblems(sorted), 20));
}

/**
 * The definition argument of every tool that takes one. It is the only place an agent learns the
 * format, so it carries the whole grammar in brief; the docs (Sequences: definition, nodes,
 * templates, validation) have the long form.
 */
export const definitionInput = z
  .record(z.string(), z.unknown())
  .describe(
    [
      'The sequence definition, one JSON document: { "schema_version": 1, "entry": "<first node id>", "settings": { "send_window": { "days": ["mon","tue","wed","thu","fri"], "from": "08:00", "to": "18:00", "tz": "contact" | "sender" }, "jitter": "15m", "reenroll": "never" | "always" | "after_90d" }, "exit_on": ["reply", "meeting_booked"] (either, both or []), "nodes": { "<id>": { "type", "channel"?, "action"?, "name"?, "params", "next": { "<transition>": "<node id>" }, "branches_by_outcome"? } } }.',
      'Node ids are lower_snake_case. Node types, their params and the transitions they emit:',
      'start: no params; then (required).',
      'outreach email: "channel": "email", "action": "send", params { name?, subject, body, format: "text" (default) | "html", reply_in_thread: bool }; sent, skipped, failed.',
      'outreach sms: "channel": "sms", "action": "send", params { name?, body }; sent, skipped, failed.',
      'wait: params { duration }; then (required).',
      'wait_for: params { events: ["reply" | "reply:email" | "reply:sms" | "call_connected" | "meeting_booked"], timeout? }; one transition per event, plus timeout.',
      'condition: params { mode: "all" | "any", rules: [{ field, op, value? }] } (fields like history.replied_since_enrollment, attrs.<path>, crm.deal.stage); yes and no (both required).',
      'task: params { kind (like "call"), title, body?, link?, due, expire?, dialer? }; completed, no_answer, plus "branches_by_outcome": { "<outcome>": "<node id>" }.',
      'end: params { label }; no next.',
      'A transition left unwired ends the enrollment when taken. Every node must be reachable from entry, and a loop needs a wait or task on it.',
      'Durations: a number then m, h, d or bd (business days), like "2bd".',
      'Templates in subjects, bodies and task fields: {{ path }} or {{ path | "fallback" }}, nothing else (no logic). Paths: contact.first_name, contact.last_name, contact.email (these three need a fallback, like {{ contact.first_name | "there" }}), contact.phone, contact.country, attrs.<path>, sender.name, sender.first_name, sender.email, sender.attrs.<path>, sender.signature (the sender\'s stored signature, set with upsert_sender; end an email body with {{ sender.signature }}), sequence.name, unsubscribe_url (every email body should include it).',
    ].join(' ')
  );

/**
 * The same definition, without the format guide: the guide lives once, on
 * validate_sequence_definition, so tools/list stays small for every client.
 */
export const definitionRefInput = z
  .record(z.string(), z.unknown())
  .describe(
    'The sequence definition JSON. Its format (nodes, transitions, durations, settings, templates) is described on the definition argument of validate_sequence_definition; validate there first.'
  );

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
    "Reads one sequence: its status, every version, and the definition (the steps) of its default version with any validation problems. Pass `version` (an id or a tag like v2) to see another version's definition. To edit, read the draft with get_sequence_version (it gives the lock_version that save_sequence_draft needs).",
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
    'Checks a sequence definition document (schema_version, entry, settings, exit_on, nodes) without saving it, and returns every problem with its path. Errors block publishing; warnings do not. Use it while drafting or editing steps, before create_sequence or save_sequence_draft.',
  scope: 'read',
  input: { definition: definitionInput },
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

export const createSequence = defineTool({
  name: 'create_sequence',
  title: 'Create a sequence',
  description:
    'Creates a sequence and its first version, v1, as a draft. Pass `definition` to start from your own steps (check it first with validate_sequence_definition); without one, v1 is an empty start-to-end draft. A draft never sends anything and cannot be enrolled into: edit it with save_sequence_draft (the answer gives the version id and lock_version it needs), then make it live with publish_sequence_version. Problems in the definition are reported, not refused.',
  scope: 'admin',
  input: {
    name: z.string().min(1).max(160).describe('The name people see, like "UK intro".'),
    description: z.string().max(2000).optional().describe('What the sequence is for.'),
    external_id: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe(
        'Your own id for the sequence, like "uk-intro"; every tool then accepts it in place of seq_….'
      ),
    labels: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Free JSON your app keeps on the sequence.'),
    definition: definitionRefInput.optional(),
    created_by: z
      .string()
      .max(64)
      .optional()
      .describe('Who asked for it (a user id or email), recorded on the sequence and v1.'),
  },
  hints: { destructive: false, idempotent: false },
  async run(client, args) {
    const created = await client.sequences.create(
      compact({
        name: args.name,
        description: args.description,
        external_id: args.external_id,
        labels: args.labels,
        definition: args.definition,
        created_by: args.created_by,
      })
    );
    const { sequence, version, problems } = created;
    const ext = sequence.externalId ? `, external id ${sequence.externalId}` : '';
    const nodes = describeNodes(version.definition);
    return {
      summary: lines(
        `Created sequence "${sequence.name}" (${sequence.id}${ext}) with draft ${version.tag} (${version.id}, lock_version ${version.lockVersion}).`,
        args.definition
          ? `The draft has ${count(nodes.length, 'step')}.`
          : 'The draft is an empty start-to-end sequence; write the steps with save_sequence_draft.',
        problemsBlock(problems),
        'Nothing sends until a version is published (publish_sequence_version).'
      ),
      data: created,
    };
  },
});

export const setSequenceStatus = defineTool({
  name: 'set_sequence_status',
  title: 'Pause, resume or archive a sequence',
  description:
    'Sets a sequence to active, paused or archived. paused stops every step of every version; contacts keep their place and carry on when it is active again. archived ends the sequence for good: it is refused while contacts are still in it, unless exit_active is true, which exits all of them now with reason manual. Pausing is usually what a person means by "stop it".',
  scope: 'admin',
  input: {
    sequence: ref('sequence', 'seq_01J9…', 'uk-intro'),
    status: z.enum(['active', 'paused', 'archived']).describe('The status to set.'),
    exit_active: z
      .boolean()
      .optional()
      .describe(
        'Only with archived: exit every contact still in the sequence. Without it, archiving a sequence with contacts in it is refused.'
      ),
  },
  hints: { destructive: true, idempotent: true },
  async run(client, args) {
    const s = await client.sequences.update(
      args.sequence,
      compact({ status: args.status, exit_active: args.exit_active })
    );
    const what: Record<string, string> = {
      active: 'Its steps run again.',
      paused: 'No step runs until it is active again; contacts keep their place.',
      archived: args.exit_active
        ? 'Anyone who was still in it has exited.'
        : 'Nobody was in it, so nobody exited.',
    };
    return {
      summary: `"${s.name}" (${s.id}) is now ${s.status}. ${what[s.status] ?? ''}`.trim(),
      data: s,
    };
  },
});
