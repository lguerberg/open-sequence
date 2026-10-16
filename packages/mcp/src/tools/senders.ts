/** Senders: who the outreach is sent as, their signature, and which steps each one can run. */
import { OpenSequenceError } from '@opensequence/sdk';
import type { OpenSequence, Readiness, SenderDetail } from '@opensequence/sdk';
import { z } from 'zod';
import {
  ToolError,
  bullets,
  compact,
  count,
  defineTool,
  isServiceId,
  lines,
  nextPage,
  paging,
  ref,
} from '../tool.js';

const CHANNELS = ['email', 'sms'] as const;

export const listSenders = defineTool({
  name: 'list_senders',
  title: 'List senders',
  description:
    'Lists the senders (the people outreach is sent as) with their external id, email, time zone and status. Use it to find the sender a person means by name ("with Max") before enrolling. get_sender shows one with their channels and signature.',
  scope: 'read',
  input: { ...paging },
  async run(client, args) {
    const page = await client.senders.list(compact({ limit: args.limit, cursor: args.cursor }));
    const rows = page.items.map(
      (s) =>
        `${s.name} (external id ${s.externalId}, ${s.id}): ${s.email ?? 'no email'}, ${s.timezone}, ${s.status}`
    );
    return {
      summary: lines(
        `${count(page.items.length, 'sender')}.`,
        bullets(rows, 25),
        nextPage(page.nextCursor)
      ),
      data: { items: page.items, next_cursor: page.nextCursor },
    };
  },
});

export const getSenderReadiness = defineTool({
  name: 'get_sender_readiness',
  title: 'Check sender readiness',
  description:
    'Says which kinds of steps a sender can run right now (email, sms, task) and, for each one they cannot, why (no_email_channel, no_allo_number, …). Check it before enrolling contacts with a sender.',
  scope: 'read',
  input: { sender: ref('sender', 'snd_01J9…', 'u_42') },
  async run(client, args) {
    const readiness: Readiness = await client.senders.readiness(args.sender);
    const can = CHANNELS.filter((c) => readiness[c]?.ok);
    const cannot = CHANNELS.filter((c) => !readiness[c]?.ok).map(
      (c) => `${c} (${readiness[c]?.reason ?? 'not ready'})`
    );
    const summary = lines(
      `Sender ${args.sender} can run: ${[...can, 'task'].join(', ')}.`,
      cannot.length
        ? `Cannot run: ${cannot.join(', ')}. Those steps are skipped for this sender's contacts.`
        : 'Every channel is ready.'
    );
    return { summary, data: readiness };
  },
});

/** "first line of the text signature" (up to 80 characters), or "not set". */
function signatureLine(s: { signatureHtml: string | null; signatureText: string | null }): string {
  if (!s.signatureHtml && !s.signatureText)
    return 'Signature: not set; {{ sender.signature }} renders as nothing.';
  const text = (s.signatureText ?? '').replace(/\s+/g, ' ').trim();
  const preview = text.length > 80 ? `${text.slice(0, 79)}…` : text;
  return `Signature: set${s.signatureHtml ? ' (HTML and text)' : ' (text only)'}${preview ? `: "${preview}"` : ''}.`;
}

export const getSender = defineTool({
  name: 'get_sender',
  title: 'Get a sender',
  description:
    'Reads one sender: name, email, time zone, status, attrs, their email signature (what {{ sender.signature }} renders), their channels with daily limits, and which steps they can run now. Read it before upsert_sender to see what is stored.',
  scope: 'read',
  input: { sender: ref('sender', 'snd_01J9…', 'u_42') },
  async run(client, args) {
    const s: SenderDetail = await client.senders.get(args.sender);
    const channels = s.channels.map(
      (c) =>
        `${c.channel} ${c.address}: ${c.status}${c.dailyLimit !== null ? `, up to ${c.dailyLimit} a day` : ''}`
    );
    const notReady = CHANNELS.filter((c) => !s.readiness[c]?.ok).map(
      (c) => `${c} (${s.readiness[c]?.reason ?? 'not ready'})`
    );
    return {
      summary: lines(
        `${s.name} (external id ${s.externalId}, ${s.id}): ${s.email ?? 'no email'}, ${s.timezone}, ${s.status}.`,
        signatureLine(s),
        channels.length ? `Channels:\n${bullets(channels)}` : 'No channels connected yet.',
        notReady.length ? `Cannot run: ${notReady.join(', ')}.` : 'Every channel is ready.'
      ),
      data: s,
    };
  },
});

/** The stored sender, or null when there is none with that id. */
async function existingSender(client: OpenSequence, id: string): Promise<SenderDetail | null> {
  try {
    return await client.senders.get(id);
  } catch (err) {
    if (err instanceof OpenSequenceError && err.status === 404) return null;
    throw err;
  }
}

export const upsertSender = defineTool({
  name: 'upsert_sender',
  title: 'Create or update a sender',
  description:
    'Creates a sender (a person outreach is sent as) by your external id, or updates one. Fields you leave out keep their stored value, so you can change only the signature. The signature is what {{ sender.signature }} renders at the end of an email: signature_html for html emails (sanitized on save: links, images, line breaks and simple tables stay; scripts and forms are dropped) and signature_text for text emails (derived from the HTML when you leave it out). null clears a signature. Connecting a mailbox or phone number is not done here.',
  scope: 'admin',
  input: {
    sender: z
      .string()
      .min(1)
      .max(64)
      .describe(
        'Your external id for the sender, like "u_42". A service id (snd_…) works for a sender that already exists.'
      ),
    name: z.string().min(1).max(160).optional().describe('Full name. Required for a new sender.'),
    email: z
      .string()
      .email()
      .max(320)
      .nullable()
      .optional()
      .describe('The address they send from; null removes it.'),
    timezone: z
      .string()
      .max(48)
      .optional()
      .describe('IANA time zone, like "Europe/London". A new sender defaults to UTC.'),
    attrs: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Free attributes templates can read as {{ sender.attrs.<key> }}. Replaces the stored attrs as a whole.'
      ),
    signature_html: z
      .string()
      .max(20_000)
      .nullable()
      .optional()
      .describe('The email signature as HTML, like "<p>Max Rivera<br>Acme</p>". null clears it.'),
    signature_text: z
      .string()
      .max(4_000)
      .nullable()
      .optional()
      .describe('The plain-text signature for text emails. Default: derived from signature_html.'),
  },
  hints: { destructive: false, idempotent: true },
  async run(client, args) {
    const existing = await existingSender(client, args.sender);
    if (!existing && isServiceId(args.sender, 'snd'))
      throw new ToolError(
        'NOT_FOUND',
        `There is no sender ${args.sender}. To create one, use your own external id for it (like "u_42"), not a snd_ id.`
      );
    if (!existing && args.name === undefined)
      throw new ToolError(
        'VALIDATION_ERROR',
        `There is no sender "${args.sender}" yet. Give a name to create one.`
      );
    // The API replaces every field on PUT; filling the left-out ones from the stored sender makes
    // "change only the signature" safe. Signatures are left out when not given: the API keeps them.
    const externalId = existing?.externalId ?? args.sender;
    const saved = await client.senders.upsert(
      externalId,
      compact({
        name: args.name ?? existing!.name,
        email: args.email !== undefined ? args.email : (existing?.email ?? undefined),
        timezone: args.timezone ?? existing?.timezone,
        attrs: args.attrs ?? existing?.attrs,
        signature_html: args.signature_html,
        signature_text: args.signature_text,
      })
    );
    return {
      summary: lines(
        `${existing ? 'Updated' : 'Created'} sender ${saved.name} (external id ${saved.externalId}, ${saved.id}): ${saved.email ?? 'no email'}, ${saved.timezone}.`,
        signatureLine(saved),
        existing
          ? ''
          : 'Before enrolling with them, connect a mailbox or number in the app; get_sender_readiness says which steps they can run.'
      ),
      data: saved,
    };
  },
});
