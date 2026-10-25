/**
 * Reading one inbox message without the mailbox: what IMAP hands over (envelope, a few headers,
 * the body structure) becomes an `InboundMeta`, and `classifyInbound` turns that into the same
 * InboundEvent (reply, auto-reply, bounce) or nothing. A bounce needs
 * the full source, which the caller fetches on demand; the fixture tests build the meta from a
 * raw message with `metaFromSource`.
 */
import type { InboundEvent } from '@opensequence/core';
import { simpleParser, type AddressObject, type ParsedMail } from 'mailparser';
import {
  bareAddress,
  isAutoReplyHeaders,
  isBounceSender,
  isDeliveryStatusType,
  isHardBounce,
  messageIdsIn,
  normalizeMessageId,
  parseStatusFields,
  parseUntil,
  type DeliveryStatus,
} from '../email/inbound.js';
import { htmlReplyText, stripQuotedReply } from '../email/reply-text.js';

/** The headers fetched for every new message, beside the envelope. */
export const INBOUND_HEADERS = [
  'message-id',
  'in-reply-to',
  'references',
  'auto-submitted',
  'x-autoreply',
  'x-autorespond',
  'precedence',
  'x-failed-recipients',
  'original-message-id',
];

export interface InboundMeta {
  /** A stable id for the message: its own Message-ID when it has one, otherwise the mailbox position. */
  externalId: string;
  from: string;
  to: string;
  subject?: string;
  date?: Date;
  /** Every id named by In-Reply-To and References, bare, in that order. */
  referenced: string[];
  /** First value of a header, lower-case name. */
  header: (name: string) => string | undefined;
  hasDeliveryStatus: boolean;
}

export interface InboundScope {
  /** Our Message-IDs, bare, mapped to the exact string the engine stores (with brackets). */
  ours: Map<string, string>;
  /** Thread roots the engine knows, bare, mapped to the stored string. */
  threads: Map<string, string>;
  /** The sender's own address, lower-case. */
  self: string;
  includeBodies: boolean;
  now: () => Date;
}

/** `<a>` and `<b>` keyed by their bare form, so a match can be reported in the engine's own spelling. */
export function indexIds(ids: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const id of ids) out.set(normalizeMessageId(id), id);
  return out;
}

/** The header block IMAP returns for a `HEADER.FIELDS` fetch: unfolded, one entry per occurrence. */
export function parseHeaderBlock(block: Buffer | string | undefined): Array<[string, string]> {
  if (!block) return [];
  const text = typeof block === 'string' ? block : block.toString('utf8');
  const out: Array<[string, string]> = [];
  for (const line of text.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const m = /^([!-9;-~]+):\s*(.*)$/.exec(line);
    if (m) out.push([m[1]!.toLowerCase(), m[2]!.trim()]);
  }
  return out;
}

export function headerGetter(
  entries: Array<[string, string]>
): (name: string) => string | undefined {
  return (name) => entries.find(([n]) => n === name.toLowerCase())?.[1];
}

/** Does any part of the structure carry a delivery status report? */
export function structureHasDeliveryStatus(
  node: { type?: string; childNodes?: unknown[] } | undefined
): boolean {
  if (!node) return false;
  if (isDeliveryStatusType(node.type)) return true;
  return (node.childNodes ?? []).some((child) =>
    structureHasDeliveryStatus(child as { type?: string; childNodes?: unknown[] })
  );
}

export async function classifyInbound(
  meta: InboundMeta,
  scope: InboundScope,
  source: () => Promise<Buffer>
): Promise<InboundEvent | null> {
  const from = bareAddress(meta.from);
  if (from === scope.self) return null;
  const inReplyTo = meta.referenced.find((id) => scope.ours.has(id));
  const threadRef = meta.referenced
    .map((id) => scope.threads.get(id))
    .find((t): t is string => t !== undefined);
  const occurredAt = meta.date ?? scope.now();

  if (isBounceSender(from) || meta.hasDeliveryStatus) {
    // A bounce's link to our message sits in its attached original, so it needs the full body.
    const status = await parseBounceSource(await source(), scope.ours, meta.header);
    const original = status.originalMessageId ?? inReplyTo;
    if (threadRef === undefined && (original === undefined || !scope.ours.has(original)))
      return null;
    return {
      kind: 'bounce',
      channel: 'email',
      externalId: meta.externalId,
      occurredAt,
      address: status.address ?? '',
      hard: isHardBounce(status.status),
      originalMessageId: original ? scope.ours.get(original) : undefined,
      reason: status.reason,
    };
  }

  if (threadRef === undefined && inReplyTo === undefined) return null;

  // An auto-reply's "back on" date sits in its text; read it even when bodies are not kept.
  const auto = isAutoReplyHeaders(meta.header, meta.subject);
  const text =
    scope.includeBodies || auto ? bodyText(await simpleParser(await source())) : undefined;
  const event: InboundEvent = {
    kind: 'reply',
    channel: 'email',
    externalId: meta.externalId,
    occurredAt,
    from,
    to: bareAddress(meta.to),
    threadRef,
    subject: meta.subject,
    inReplyTo: inReplyTo ? scope.ours.get(inReplyTo) : meta.referenced[0],
    body: scope.includeBodies && text ? stripQuotedReply(text) : undefined,
  };
  if (auto) {
    const until = parseUntil(meta.subject, scope.now()) ?? parseUntil(text, scope.now());
    event.autoReply = until ? { until } : {};
  }
  return event;
}

/**
 * Reads a DSN out of a raw bounce (RFC 3464). The delivery-status part gives the recipient, the
 * status and the diagnostic; the attached original (message/rfc822 or text/rfc822-headers) gives
 * the Message-ID we sent. An id of ours wins over any other id the bounce mentions.
 */
export async function parseBounceSource(
  source: Buffer,
  ours: Map<string, string>,
  header?: (name: string) => string | undefined
): Promise<DeliveryStatus> {
  const parsed = await simpleParser(source);
  const result: DeliveryStatus = {};
  const candidateIds: string[] = [];
  const selfId = parsed.messageId ? normalizeMessageId(parsed.messageId) : undefined;
  const top = (name: string) => header?.(name) ?? headerValue(parsed, name);

  for (const h of ['original-message-id', 'x-original-message-id'])
    for (const id of messageIdsIn(top(h))) candidateIds.push(id);
  result.address = bareAddress(top('x-failed-recipients')) || undefined;

  const texts: Array<{ type: string; text: string }> = [];
  if (parsed.text) texts.push({ type: 'text/plain', text: parsed.text });
  for (const a of parsed.attachments)
    texts.push({ type: a.contentType.toLowerCase(), text: a.content.toString('utf8') });

  for (const { type, text } of texts) {
    // mailparser folds a message/delivery-status part into the text body, so both are read as fields.
    if (type === 'message/delivery-status' || type === 'text/plain') {
      const fields = parseStatusFields(text);
      result.status ??= fields.status;
      result.address ??= fields.recipient;
      result.reason ??= fields.diagnostic;
    }
    if (type === 'message/rfc822' || type === 'text/rfc822-headers') {
      const to = /^To:\s*(.+)$/im.exec(text);
      if (!result.address && to) result.address = bareAddress(to[1]!.trim()) || undefined;
    }
    for (const m of text.matchAll(/Message-ID:\s*<([^<>\s]+)>/gi)) candidateIds.push(m[1]!);
    if (!result.status) {
      const code = /\b([245]\.\d{1,3}\.\d{1,3})\b/.exec(text);
      if (code) result.status = code[1];
    }
  }

  const ids = candidateIds.filter((id) => id !== selfId);
  result.originalMessageId = ids.find((id) => ours.has(id)) ?? ids[0];
  result.reason ??= parsed.text
    ?.trim()
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0)
    ?.slice(0, 300);
  return result;
}

/** Builds the meta from a raw message, for tests and for mailboxes that cannot answer a structure fetch. */
export async function metaFromSource(source: Buffer, externalId?: string): Promise<InboundMeta> {
  const parsed = await simpleParser(source);
  const entries: Array<[string, string]> = [];
  for (const { key, line } of parsed.headerLines)
    entries.push([
      key.toLowerCase(),
      line
        .replace(/^[^:]+:\s*/, '')
        .replace(/\r?\n[ \t]+/g, ' ')
        .trim(),
    ]);
  const header = headerGetter(entries);
  const references = Array.isArray(parsed.references)
    ? parsed.references
    : parsed.references
      ? [parsed.references]
      : [];
  const referenced = [
    ...messageIdsIn(parsed.inReplyTo),
    ...references.map(normalizeMessageId),
    ...messageIdsIn(header('references')),
  ];
  return {
    externalId:
      externalId ??
      (parsed.messageId ? normalizeMessageId(parsed.messageId) : `imap:${Date.now()}`),
    from: firstAddress(parsed.from),
    to: firstAddress(parsed.to),
    subject: parsed.subject,
    date: parsed.date,
    referenced: [...new Set(referenced)],
    header,
    hasDeliveryStatus:
      isDeliveryStatusType(header('content-type')?.split(';')[0]) ||
      parsed.attachments.some((a) => isDeliveryStatusType(a.contentType)),
  };
}

function headerValue(parsed: ParsedMail, name: string): string | undefined {
  const v = parsed.headers.get(name.toLowerCase());
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}

export function firstAddress(value: AddressObject | AddressObject[] | undefined): string {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.value[0]?.address ?? '';
}

/** The plain text of a message; HTML-only mail is cut before its marked-up quote and stripped of tags. */
function bodyText(parsed: ParsedMail): string | undefined {
  return (parsed.text ?? (parsed.html ? htmlReplyText(parsed.html) : undefined))?.trim();
}
