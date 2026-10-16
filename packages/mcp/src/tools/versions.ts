/**
 * Versions: read one, save a draft, publish it, copy a version into a new draft. Published
 * versions are immutable; enrolled contacts finish the version they started.
 */
import type { Definition, Version } from '@opensequence/sdk';
import { z } from 'zod';
import {
  ToolError,
  bullets,
  count,
  defineTool,
  isServiceId,
  lines,
  ref,
  versionId,
} from '../tool.js';
import { definitionInput, describeNodes, problemsBlock } from './sequences.js';

const versionRef = (what: string) =>
  z.string().min(1).describe(`${what}: a version id (ver_…) or its tag (v2).`);

function steps(definition: Definition): string {
  const nodes = describeNodes(definition);
  const entry = definition['entry'] as string | undefined;
  return lines(
    `${count(nodes.length, 'step')}${entry ? `, starting at "${entry}"` : ''}:`,
    bullets(nodes, 20)
  );
}

/** The next free `vN` tag of a sequence: one more than the highest number used. */
function nextTag(tags: string[]): string {
  const numbers = tags.map((t) => /^v(\d+)$/.exec(t)?.[1]).filter((n): n is string => !!n);
  return `v${Math.max(0, ...numbers.map(Number)) + 1}`;
}

/** What to do next with a version, by its status. */
function nextStep(v: Version): string {
  if (v.status === 'draft')
    return `To edit it, call save_sequence_draft with version ${v.id} and lock_version ${v.lockVersion}.`;
  if (v.status === 'published')
    return 'Published versions never change. To edit, make a new draft from it with create_sequence_version.';
  return 'It is archived: nobody new is enrolled into it. create_sequence_version can copy it into a new draft.';
}

export const getSequenceVersion = defineTool({
  name: 'get_sequence_version',
  title: 'Get a sequence version',
  description:
    'Reads one version of a sequence: its status, its full definition, its lock_version and its validation problems. Call it before save_sequence_draft (the save needs the lock_version), and again after a STALE_LOCK refusal to get the latest definition.',
  scope: 'read',
  input: {
    sequence: ref('sequence', 'seq_01J9…', 'uk-intro'),
    version: versionRef('The version'),
  },
  async run(client, args) {
    const id = (await versionId(client, args.sequence, args.version))!;
    const shown = await client.sequences.versions.get(args.sequence, id);
    const v = shown.version;
    return {
      summary: lines(
        `Version ${v.tag} (${v.id}) is ${v.status}, lock_version ${v.lockVersion}, with ${steps(v.definition)}`,
        problemsBlock(shown.problems),
        nextStep(v)
      ),
      data: shown,
    };
  },
});

export const saveSequenceDraft = defineTool({
  name: 'save_sequence_draft',
  title: 'Save a sequence draft',
  description:
    'Replaces the definition of a draft version with the one you send. Send the whole document, not a patch: read it first with get_sequence_version, change it, and send it back with the lock_version you read. The save goes through even with problems, which come back so you can fix them; only publishing refuses errors. A STALE_LOCK refusal means someone saved in between: read again and redo the edit. Published versions cannot be saved; copy one into a new draft with create_sequence_version. Saving changes nothing for contacts until the draft is published.',
  scope: 'admin',
  input: {
    sequence: ref('sequence', 'seq_01J9…', 'uk-intro'),
    version: versionRef('The draft version'),
    definition: definitionInput,
    lock_version: z
      .number()
      .int()
      .min(0)
      .describe(
        'The lock_version of the draft as you last read it (0 for a new draft). It goes up by one on every save.'
      ),
  },
  hints: { destructive: false, idempotent: false },
  async run(client, args) {
    const id = (await versionId(client, args.sequence, args.version))!;
    const saved = await client.sequences.versions.saveDraft(args.sequence, id, {
      definition: args.definition,
      lock_version: args.lock_version,
    });
    const v = saved.version;
    const ready = !saved.problems.some((p) => p.severity === 'error');
    return {
      summary: lines(
        `Saved draft ${v.tag} (${v.id}): ${steps(v.definition)}`,
        `lock_version is now ${v.lockVersion}; send that with the next save.`,
        problemsBlock(saved.problems),
        ready
          ? 'Ready to publish with publish_sequence_version.'
          : 'Fix the errors and save again before publishing.'
      ),
      data: saved,
    };
  },
});

export const publishSequenceVersion = defineTool({
  name: 'publish_sequence_version',
  title: 'Publish a sequence version',
  description:
    "Publishes a draft: validates it (any error refuses the publish and lists the problems; warnings pass), freezes its definition for good, and makes it the sequence's default, so new enrollments use it. Contacts already enrolled finish the version they started. Run validate_sequence_definition or get_sequence_version first, and tell the person what goes live. Publishing a version that is already published changes nothing.",
  scope: 'admin',
  input: {
    sequence: ref('sequence', 'seq_01J9…', 'uk-intro'),
    version: versionRef('The draft to publish'),
    published_by: z
      .string()
      .max(64)
      .optional()
      .describe('Who asked for it (a user id or email). Default: the API key.'),
  },
  hints: { destructive: false, idempotent: true },
  async run(client, args) {
    const id = (await versionId(client, args.sequence, args.version))!;
    const published = await client.sequences.versions.publish(
      args.sequence,
      id,
      args.published_by ? { published_by: args.published_by } : {}
    );
    const v = published.version;
    return {
      summary: lines(
        `Published ${v.tag} (${v.id}) of ${args.sequence}. It is now the default version: new enrollments use it, and contacts already enrolled finish the version they started.`,
        published.problems.length ? problemsBlock(published.problems) : '',
        'Check who would be enrolled with preview_enrollment, then enroll_contacts.'
      ),
      data: published,
    };
  },
});

export const createSequenceVersion = defineTool({
  name: 'create_sequence_version',
  title: 'Create a sequence version',
  description:
    "Copies a version into a new draft, which is how you edit a sequence that is already published. Default source: the sequence's default (published) version. Default tag: the next free one (v2, v3, …). Then edit the copy with save_sequence_draft (lock_version 0) and publish it with publish_sequence_version.",
  scope: 'admin',
  input: {
    sequence: ref('sequence', 'seq_01J9…', 'uk-intro'),
    from_version: z
      .string()
      .min(1)
      .optional()
      .describe(
        "The version to copy: a version id (ver_…) or its tag (v2). Default: the sequence's default version, else the newest."
      ),
    tag: z
      .string()
      .regex(/^[A-Za-z0-9][\w.-]{0,23}$/, 'up to 24 letters, digits, dots and dashes, like v3')
      .optional()
      .describe(
        'The new version\'s tag, unique in the sequence, like "v3". Default: the next free vN.'
      ),
    created_by: z.string().max(64).optional().describe('Who asked for it (a user id or email).'),
  },
  hints: { destructive: false, idempotent: false },
  async run(client, args) {
    const detail = await client.sequences.get(args.sequence);
    const wanted = args.from_version;
    const match = detail.versions.find((v) => v.id === wanted || v.tag === wanted);
    if (wanted !== undefined && !match && !isServiceId(wanted, 'ver')) {
      const tags = detail.versions.map((v) => v.tag).join(', ') || 'none';
      throw new ToolError(
        'VERSION_NOT_FOUND',
        `Sequence "${detail.name}" has no version "${wanted}". Its versions: ${tags}.`
      );
    }
    const from = match?.id ?? wanted;
    const tag = args.tag ?? nextTag(detail.versions.map((v) => v.tag));
    const v = await client.sequences.versions.create(detail.id, {
      tag,
      ...(from ? { from_version: from } : {}),
      ...(args.created_by ? { created_by: args.created_by } : {}),
    });
    const source = detail.versions.find((x) => x.id === v.basedOnVersionId);
    return {
      summary: lines(
        `Created draft ${v.tag} (${v.id}) of "${detail.name}", copied from ${source ? source.tag : (v.basedOnVersionId ?? 'the default version')}.`,
        `Edit it with save_sequence_draft (version ${v.id}, lock_version ${v.lockVersion}), then publish it with publish_sequence_version. Until then the published version keeps running.`
      ),
      data: v,
    };
  },
});
