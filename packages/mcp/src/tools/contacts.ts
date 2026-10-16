/** Contacts: upsert, read, list, timeline, and the events the service cannot see for itself. */
import { randomUUID } from 'node:crypto';
import type { TimelineItem } from '@opensequence/sdk';
import { z } from 'zod';
import {
  bullets,
  compact,
  count,
  defineTool,
  lines,
  nextPage,
  paging,
  personName,
  ref,
  updatedSince,
  when,
} from '../tool.js';

/** The fields a contact has, shared by `upsert_contact` and the inline contacts of `enroll_contacts`. */
export const contactFields = {
  first_name: z.string().nullable().optional().describe('First name (null clears it).'),
  last_name: z.string().nullable().optional().describe('Last name (null clears it).'),
  email: z.string().nullable().optional().describe('Email address; needed for email steps.'),
  phone: z
    .string()
    .nullable()
    .optional()
    .describe('Phone in E.164 (+447700900123); needed for SMS and call steps.'),
  country: z.string().nullable().optional().describe('Two-letter ISO country code (GB, US).'),
  timezone: z
    .string()
    .nullable()
    .optional()
    .describe("IANA time zone (Europe/London); sends land in the contact's working hours."),
  attrs: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'Your own fields for conditions (deal stage, company size); deep-merged into what is stored.'
    ),
};

function timelineLine(t: TimelineItem): string {
  const at = when(t.at);
  if (t.kind === 'message') {
    const m = t.item;
    return `${at} ${m.channel} ${m.direction === 'out' ? 'sent' : 'received'}${m.subject ? ` "${m.subject}"` : ''} (${m.status})`;
  }
  if (t.kind === 'signal')
    return `${at} signal ${t.item.kind}${t.item.channel ? ` on ${t.item.channel}` : ''} from ${t.item.source}`;
  return `${at} task ${t.item.kind} "${t.item.title}" (${t.item.status}${t.item.outcome ? `, outcome ${t.item.outcome}` : ''})`;
}

export const upsertContact = defineTool({
  name: 'upsert_contact',
  title: 'Create or update a contact',
  description:
    "Creates a contact, or updates the one with this external id (your app's own id for the person). Only the fields you pass change; attrs are deep-merged. Use it before enrolling someone who is not in OpenSequence yet.",
  scope: 'enroll',
  input: {
    external_id: z
      .string()
      .min(1)
      .max(64)
      .describe("Your app's id for the person (e.g. p_7). The same id updates the same contact."),
    ...contactFields,
  },
  hints: { idempotent: true },
  async run(client, args) {
    const { external_id, ...fields } = args;
    const contact = await client.contacts.upsert(external_id, compact(fields));
    return {
      summary: `Saved ${personName(contact, external_id)} (external id ${contact.externalId}, ${contact.id}).`,
      data: contact,
    };
  },
});

export const getContact = defineTool({
  name: 'get_contact',
  title: 'Get a contact',
  description:
    'Reads one contact with their suppressions (opt-outs, do-not-contact) and the sequence they are in right now, if any.',
  scope: 'read',
  input: { contact: ref('contact', 'ctc_01J9…', 'p_7') },
  async run(client, args) {
    const c = await client.contacts.get(args.contact);
    const reach = [c.email, c.phone, c.timezone].filter(Boolean).join(', ');
    const e = c.enrollment;
    const summary = lines(
      `${personName(c, c.externalId)} (external id ${c.externalId}, ${c.id})${reach ? `: ${reach}` : ''}.`,
      e
        ? `In a sequence: enrollment ${e.id} in ${e.sequenceId}, ${e.status}, at step "${e.currentNodeId}".`
        : 'Not in a sequence.',
      c.suppressions.length
        ? `Suppressed: ${c.suppressions.map((s) => `${s.channel} (${s.reason})`).join(', ')}.`
        : null
    );
    return { summary, data: c };
  },
});

export const listContacts = defineTool({
  name: 'list_contacts',
  title: 'List contacts',
  description:
    'Lists contacts, optionally only the one with an email address or an external id. Use it to find a contact when you know their email.',
  scope: 'read',
  input: {
    email: z.string().optional().describe('Only the contact with this email address.'),
    external_id: z.string().optional().describe('Only the contact with this id from your app.'),
    updated_since: updatedSince,
    ...paging,
  },
  async run(client, args) {
    const page = await client.contacts.list(compact({ ...args }));
    const rows = page.items.map(
      (c) =>
        `${personName(c, c.externalId)} (external id ${c.externalId}, ${c.id})${c.email ? `: ${c.email}` : ''}`
    );
    return {
      summary: lines(
        `${count(page.items.length, 'contact')}.`,
        bullets(rows, 25),
        nextPage(page.nextCursor)
      ),
      data: { items: page.items, next_cursor: page.nextCursor },
    };
  },
});

export const getContactTimeline = defineTool({
  name: 'get_contact_timeline',
  title: "Get a contact's timeline",
  description:
    'Everything that happened with one contact, newest first: messages sent and received, signals (replies, bounces, meetings booked, opt-outs) and tasks.',
  scope: 'read',
  input: {
    contact: ref('contact', 'ctc_01J9…', 'p_7'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Return only the newest N items (default 50).'),
  },
  async run(client, args) {
    const all = await client.contacts.timeline(args.contact);
    const items = all.slice(0, args.limit ?? 50);
    const cut = all.length > items.length ? ` (showing the newest ${items.length})` : '';
    return {
      summary: lines(
        `${count(all.length, 'timeline item')} for ${args.contact}${cut}, newest first.`,
        bullets(items.map(timelineLine), 15)
      ),
      data: { contact: args.contact, total: all.length, items },
    };
  },
});

export const reportContactEvent = defineTool({
  name: 'report_contact_event',
  title: 'Report a contact event',
  description:
    'Tells OpenSequence something it cannot see for itself, so the contact\'s sequence reacts: meeting_booked (a meeting booked outside the connected calendar), opt_out (per channel, or "all"), suppressed (do not contact; give a reason such as do_not_contact, bad_number, invalid_email, left_company) or reply (a reply seen in another tool; give the channel). It applies to every active enrollment of the contact, and the sequence\'s exit rules decide whether it ends. Idempotent by `id`.',
  scope: 'enroll',
  input: {
    contact: ref('contact', 'ctc_01J9…', 'p_7'),
    type: z.enum(['meeting_booked', 'opt_out', 'suppressed', 'reply']).describe('What happened.'),
    id: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Your id for this event; reporting the same id again changes nothing. Generated when left out, so pass one if you might retry.'
      ),
    occurred_at: z.string().optional().describe('When it happened, ISO-8601 (default: now).'),
    channel: z
      .enum(['email', 'sms', 'all'])
      .optional()
      .describe('The channel: required for opt_out and reply.'),
    reason: z
      .string()
      .optional()
      .describe(
        'For suppressed: do_not_contact, bad_number, invalid_email, left_company, or your own.'
      ),
    data: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Anything else to keep with the event (a meeting link, the source system).'),
  },
  hints: { idempotent: true },
  async run(client, args) {
    const { contact, ...event } = args;
    const id = event.id ?? `mcp_${randomUUID()}`;
    const result = await client.contacts.reportEvent(contact, compact({ ...event, id }));
    const summary = result.created
      ? `Recorded ${event.type} for ${contact} (event id ${id}, signal ${result.signal}). It takes effect on every active enrollment of the contact.`
      : `Event id ${id} was already reported (signal ${result.signal}); nothing changed.`;
    return { summary, data: { ...result, event_id: id } };
  },
});
