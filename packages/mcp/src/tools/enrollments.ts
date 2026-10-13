/** Enrollments: preview, enroll, exit, the journey, list. A contact is in at most one active sequence. */
import type { EnrollInput, EnrollPreview, Journey, OpenSequence, Run } from '@opensequence/sdk';
import { z } from 'zod';
import { contactFields } from './contacts.js';
import {
  ToolError,
  bullets,
  compact,
  contactId,
  count,
  defineTool,
  isServiceId,
  lines,
  nextPage,
  paging,
  personName,
  ref,
  senderId,
  sequenceId,
  updatedSince,
  versionId,
  when,
} from '../tool.js';

const contactsInput = z
  .array(
    z.union([
      z.string().min(1).describe('A contact id (ctc_…) or external id (p_7).'),
      z
        .object({
          external_id: z.string().min(1).max(64).describe("Your app's id for the person."),
          ...contactFields,
        })
        .describe('A contact to create or update first, then enroll.'),
    ])
  )
  .min(1)
  .max(5000)
  .describe(
    'Who to enroll: contact ids, external ids, or contact objects with an external_id (created or updated first).'
  );

const enrollTarget = {
  sequence: ref('sequence', 'seq_01J9…', 'uk-intro'),
  contacts: contactsInput,
  sender: ref('sender the outreach is sent as', 'snd_01J9…', 'u_42'),
  version: z
    .string()
    .optional()
    .describe(
      "A published version id (ver_…) or tag (v2). Default: the sequence's default version."
    ),
};

async function enrollBody(
  client: OpenSequence,
  args: { sequence: string; contacts: EnrollInput['contacts']; sender: string; version?: string }
): Promise<EnrollInput> {
  return compact({
    contacts: args.contacts,
    sender: args.sender,
    version: await versionId(client, args.sequence, args.version),
  });
}

function previewLines(p: EnrollPreview): string[] {
  return [
    ...p.accepted.map(
      (a) => `${a.external_id} (${a.contact_id}): first touch ${when(a.first_touch_at)}`
    ),
    ...p.skipped.map((s) => `${s.external_id} (${s.contact_id}): skipped, ${s.reason}`),
  ];
}

function capacityLine(p: EnrollPreview): string {
  return `Capacity: ${p.capacity.per_day} first touches a day; the first touches take ${count(p.capacity.days_to_first_touches, 'day')}.`;
}

export const previewEnrollment = defineTool({
  name: 'preview_enrollment',
  title: 'Preview an enrollment',
  description:
    'Dry check before enroll_contacts, with no writes: who would be enrolled and when their first touch would go out, who would be skipped and why (suppressed, re-enrolled too soon, no usable channel), and the daily capacity. Fails the same way enrolling would when a contact is already in a sequence.',
  scope: 'read',
  input: enrollTarget,
  async run(client, args) {
    const preview = await client.sequences.previewEnrollment(
      args.sequence,
      await enrollBody(client, args)
    );
    const total = preview.accepted.length + preview.skipped.length;
    const summary = lines(
      `Preview for ${args.sequence} as ${args.sender}: ${preview.accepted.length} of ${total} would be enrolled, ${preview.skipped.length} skipped. Nothing was written.`,
      bullets(previewLines(preview), 20),
      capacityLine(preview)
    );
    return { summary, data: preview };
  },
});

export const enrollContacts = defineTool({
  name: 'enroll_contacts',
  title: 'Enroll contacts in a sequence',
  description:
    'Enrolls contacts in a sequence, sent as one sender; outreach starts on the schedule the sequence defines. All or nothing: if any contact is already in a sequence, nobody is enrolled and the error names them. Contacts that are suppressed or cannot be reached are skipped with a reason; the rest are enrolled. Run preview_enrollment first when unsure. mode "dry_run" records every step without sending anything.',
  scope: 'enroll',
  input: {
    ...enrollTarget,
    mode: z
      .enum(['live', 'dry_run'])
      .optional()
      .describe(
        'live (default) sends; dry_run records the steps as skipped_dry_run and sends nothing.'
      ),
    enrolled_by: z
      .string()
      .max(64)
      .optional()
      .describe('Who asked for this (a user id or email), recorded on each enrollment.'),
  },
  async run(client, args) {
    const body = {
      ...(await enrollBody(client, args)),
      ...compact({ mode: args.mode, enrolled_by: args.enrolled_by }),
      enrolled_by_kind: 'agent' as const,
    };
    const result = await client.sequences.enroll(args.sequence, body);
    const externalOf = new Map(result.accepted.map((a) => [a.contact_id, a.external_id]));
    const rows = result.enrollments.map(
      (e) =>
        `${externalOf.get(e.contact) ?? e.contact}: enrollment ${e.id}, ${e.status}, next step ${when(e.next_run_at)}`
    );
    const skipped = result.skipped.map((s) => `${s.external_id} (${s.contact_id}): ${s.reason}`);
    const dry =
      args.mode === 'dry_run' ? ' as a dry run (steps are recorded, nothing is sent)' : '';
    const summary = lines(
      result.enrollments.length
        ? `Enrolled ${count(result.enrollments.length, 'contact')} in ${args.sequence} as ${args.sender}${dry}.`
        : `Nobody was enrolled in ${args.sequence}: every contact was skipped.`,
      bullets(rows, 20),
      skipped.length ? `Skipped ${skipped.length}:\n${bullets(skipped, 20)}` : null
    );
    return { summary, data: result };
  },
});

export const exitEnrollment = defineTool({
  name: 'exit_enrollment',
  title: 'Exit an enrollment',
  description:
    'Takes a contact out of their sequence now: the enrollment ends with exit reason "manual" and no further steps run. Use it to free a contact who is in another sequence. Needs a key with the admin scope.',
  scope: 'admin',
  input: {
    enrollment: z
      .string()
      .min(1)
      .describe(
        'The enrollment id (enr_…), from get_contact, list_enrollments or an ALREADY_IN_SEQUENCE error.'
      ),
    reason: z
      .string()
      .max(200)
      .optional()
      .describe('Why, in a few words; kept with the enrollment.'),
    label: z
      .string()
      .max(64)
      .optional()
      .describe('A short label for reporting (e.g. "moved_to_ae").'),
  },
  hints: { destructive: true },
  async run(client, args) {
    const e = await client.enrollments.exit(
      args.enrollment,
      compact({ reason: args.reason, label: args.label })
    );
    return {
      summary: `Enrollment ${e.id} (contact ${e.contactId}, sequence ${e.sequenceId}) is ${e.status}${e.exitReason ? `, exit reason ${e.exitReason}` : ''}. No further steps run.`,
      data: e,
    };
  },
});

function runLine(r: Run): string {
  const what = [r.nodeType, r.channel, r.action].filter(Boolean).join(' ');
  const touch = r.touchNumber ? `, touch ${r.touchNumber}` : '';
  const branch = r.branch ? `, took "${r.branch}"` : '';
  return `${r.nodeId} (${what}${touch}): ${r.status}${branch}${r.error ? `, error: ${r.error}` : ''}`;
}

function journeySummary(j: Journey): string {
  const e = j.enrollment;
  const who = `${personName(j.contact, j.contact.externalId)} (external id ${j.contact.externalId})`;
  const state =
    e.status === 'exited' || e.status === 'completed' || e.status === 'failed'
      ? `${e.status}${e.exitReason ? ` (${e.exitReason})` : ''} at step "${e.currentNodeId}", ${when(e.finishedAt)}`
      : `${e.status} at step "${e.currentNodeId}", next run ${when(e.nextRunAt)}`;
  const runs = [...j.runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const sent = j.messages.filter((m) => m.direction === 'out').length;
  return lines(
    `${who} in sequence ${e.sequenceId} version ${j.version.tag}, sent as ${e.senderId}: ${state}.`,
    `${count(e.touchCount, 'touch', 'touches')}; replied: ${e.repliedAt ? `yes, ${when(e.repliedAt)} on ${e.repliedChannel ?? 'unknown channel'}` : 'no'}; meeting booked: ${e.meetingBookedAt ? `yes, ${when(e.meetingBookedAt)}` : 'no'}.`,
    runs.length ? `Steps run:\n${bullets(runs.map(runLine), 20)}` : 'No steps have run yet.',
    `${count(sent, 'message')} sent, ${j.messages.length - sent} received; ${count(j.signals.length, 'signal')}${j.signals.length ? ` (${j.signals.map((s) => s.kind).join(', ')})` : ''}; ${count(j.tasks.length, 'task')}.`
  );
}

export const getEnrollmentJourney = defineTool({
  name: 'get_enrollment_journey',
  title: "Get an enrollment's journey",
  description:
    'The full story of one enrollment: status and current step, every step that ran and the branch it took, messages, signals and tasks, plus the exact definition version it follows. Use it to answer "why did Dana get this email" or "where is Dana in the sequence".',
  scope: 'read',
  input: { enrollment: z.string().min(1).describe('The enrollment id (enr_…).') },
  async run(client, args) {
    const journey = await client.enrollments.get(args.enrollment);
    return { summary: journeySummary(journey), data: journey };
  },
});

export const listEnrollments = defineTool({
  name: 'list_enrollments',
  title: 'List enrollments',
  description:
    'Lists enrollments with the contact\'s name and email, filtered by sequence, version, status, sender, contact or exit reason. Use it for "who is in UK intro" or "who replied this week" (status exited, exit_reason reply, updated_since).',
  scope: 'read',
  input: {
    sequence: ref('sequence', 'seq_01J9…', 'uk-intro').optional(),
    version: z
      .string()
      .optional()
      .describe('A version id (ver_…), or a tag (v2) together with `sequence`.'),
    status: z
      .enum(['active', 'paused', 'waiting_limit', 'completed', 'exited', 'failed'])
      .optional()
      .describe('Only enrollments in this status.'),
    sender: ref('sender', 'snd_01J9…', 'u_42').optional(),
    contact: ref('contact', 'ctc_01J9…', 'p_7').optional(),
    exit_reason: z
      .string()
      .optional()
      .describe(
        'Only enrollments that exited for this reason (reply, meeting_booked, opt_out, bounce, manual, …).'
      ),
    updated_since: updatedSince,
    ...paging,
  },
  async run(client, args) {
    const seq = await sequenceId(client, args.sequence);
    let version = args.version;
    if (version !== undefined && !isServiceId(version, 'ver')) {
      if (!seq)
        throw new ToolError(
          'SEQUENCE_REQUIRED',
          `"${version}" looks like a version tag; pass the sequence too so it can be found, or use the version id (ver_…).`
        );
      version = await versionId(client, seq, version);
    }
    const query = compact({
      sequence: seq,
      version,
      status: args.status,
      sender: await senderId(client, args.sender),
      contact: await contactId(client, args.contact),
      exit_reason: args.exit_reason,
      updated_since: args.updated_since,
      limit: args.limit,
      cursor: args.cursor,
    });
    const page = await client.enrollments.list(query);
    const rows = page.items.map((e) => {
      const who = e.contact
        ? `${e.contact.name ?? e.contact.external_id} (${e.contact.external_id})`
        : e.contactId;
      const end = e.exitReason ? ` (${e.exitReason})` : '';
      const flags = [e.repliedAt && 'replied', e.meetingBookedAt && 'meeting booked']
        .filter(Boolean)
        .join(', ');
      return `${who}: ${e.id}, ${e.status}${end}, step "${e.currentNodeId}", ${count(e.touchCount, 'touch', 'touches')}${flags ? `, ${flags}` : ''}`;
    });
    return {
      summary: lines(
        `${count(page.items.length, 'enrollment')}.`,
        bullets(rows, 25),
        nextPage(page.nextCursor)
      ),
      data: { items: page.items, next_cursor: page.nextCursor },
    };
  },
});
