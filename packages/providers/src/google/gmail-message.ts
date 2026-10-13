import { decodeBase64url } from './mime.js';

/** The subset of Gmail's `users.messages.get` resource the adapter reads. */
export interface GmailMessage {
  id: string;
  threadId: string;
  internalDate?: string;
  snippet?: string;
  labelIds?: string[];
  payload?: GmailPart;
}

export interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}

export const METADATA_HEADERS = ['From', 'To', 'Subject', 'Date', 'In-Reply-To', 'References', 'Message-ID', 'Auto-Submitted', 'X-Autoreply', 'X-Autorespond', 'Precedence', 'X-Failed-Recipients'];

export function header(part: GmailPart | undefined, name: string): string | undefined {
  const lower = name.toLowerCase();
  return part?.headers?.find((h) => h.name.toLowerCase() === lower)?.value;
}

/** `Name <a@b.c>` → `a@b.c`, lower-cased; a bare address passes through. */
export function bareAddress(value: string | undefined): string {
  if (!value) return '';
  const match = /<([^>]+)>/.exec(value);
  return (match?.[1] ?? value).trim().toLowerCase();
}

/** Every `<id>` in a Message-ID, In-Reply-To or References header, without the brackets. */
export function messageIdsIn(value: string | undefined): string[] {
  if (!value) return [];
  const ids: string[] = [];
  for (const m of value.matchAll(/<([^<>\s]+)>/g)) ids.push(m[1]!);
  return ids;
}

export function normalizeMessageId(id: string): string {
  return id.trim().replace(/^<|>$/g, '');
}

/** Walks a payload depth-first. */
export function* walkParts(part: GmailPart | undefined): Generator<GmailPart> {
  if (!part) return;
  yield part;
  for (const child of part.parts ?? []) yield* walkParts(child);
}

export function decodedBody(part: GmailPart | undefined): string | undefined {
  const data = part?.body?.data;
  return data ? decodeBase64url(data) : undefined;
}

/** The first text/plain body in the message; falls back to a lone text/html. */
export function textBody(message: GmailMessage): string | undefined {
  let html: string | undefined;
  for (const part of walkParts(message.payload)) {
    const type = (part.mimeType ?? '').toLowerCase();
    if (type === 'text/plain') {
      const text = decodedBody(part);
      if (text !== undefined) return text;
    } else if (type === 'text/html' && html === undefined) {
      html = decodedBody(part);
    }
  }
  return html;
}

const BOUNCE_SENDER = /^(mailer-daemon|postmaster)@/i;

export function isBounceSender(from: string): boolean {
  return BOUNCE_SENDER.test(bareAddress(from));
}

export function hasDeliveryStatusPart(message: GmailMessage): boolean {
  for (const part of walkParts(message.payload)) {
    const type = (part.mimeType ?? '').toLowerCase();
    if (type === 'message/delivery-status' || type.startsWith('multipart/report')) return true;
  }
  return false;
}

export interface DeliveryStatus {
  originalMessageId?: string;
  address?: string;
  status?: string;
  reason?: string;
}

/**
 * Reads a bounce. The delivery-status part gives the recipient, the status code and the
 * diagnostic; the attached original (message/rfc822 or text/rfc822-headers) gives the
 * Message-ID we sent. `ours` is consulted first so a quoted id that is one of ours wins over
 * any other id the bounce mentions.
 */
export function parseDeliveryStatus(message: GmailMessage, ours: Set<string>): DeliveryStatus {
  const result: DeliveryStatus = {};
  const candidateIds: string[] = [];
  const selfId = messageIdsIn(header(message.payload, 'Message-ID'))[0];

  for (const h of ['Original-Message-ID', 'X-Original-Message-ID']) {
    for (const id of messageIdsIn(header(message.payload, h))) candidateIds.push(id);
  }
  result.address = bareAddress(header(message.payload, 'X-Failed-Recipients')) || undefined;

  for (const part of walkParts(message.payload)) {
    const type = (part.mimeType ?? '').toLowerCase();
    // Gmail exposes the attached original's headers as a nested part with its own header list.
    for (const id of messageIdsIn(header(part, 'Message-ID'))) if (part !== message.payload) candidateIds.push(id);
    if (!result.address && part !== message.payload) result.address = bareAddress(header(part, 'To')) || undefined;

    const text = decodedBody(part);
    if (!text) continue;
    if (type === 'message/delivery-status') {
      const fields = parseStatusFields(text);
      result.status ??= fields.status;
      result.address ??= fields.recipient;
      result.reason ??= fields.diagnostic;
    }
    for (const m of text.matchAll(/Message-ID:\s*<([^<>\s]+)>/gi)) candidateIds.push(m[1]!);
    if (!result.status) {
      const code = /\b([245]\.\d{1,3}\.\d{1,3})\b/.exec(text);
      if (code) result.status = code[1];
    }
  }

  const ids = candidateIds.filter((id) => id !== selfId);
  result.originalMessageId = ids.find((id) => ours.has(id)) ?? ids[0];
  result.reason ??= message.snippet;
  return result;
}

function parseStatusFields(text: string): { status?: string; recipient?: string; diagnostic?: string } {
  const out: { status?: string; recipient?: string; diagnostic?: string } = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const name = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (name === 'status' && !out.status) out.status = value;
    else if ((name === 'final-recipient' || name === 'original-recipient') && !out.recipient) out.recipient = bareAddress(value.replace(/^rfc822;\s*/i, ''));
    else if (name === 'diagnostic-code' && !out.diagnostic) out.diagnostic = value.replace(/^smtp;\s*/i, '');
  }
  return out;
}

const AUTO_SUBJECT = /^\s*(re:\s*)?(automatic reply|auto(?:matic)?[- ]?(?:reply|response)|out of (?:the )?office|ooo\b|abwesenheit|réponse automatique|respuesta automática)/i;

export function isAutoReply(message: GmailMessage, subject: string | undefined): boolean {
  const autoSubmitted = header(message.payload, 'Auto-Submitted')?.toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') return true;
  if (header(message.payload, 'X-Autoreply') !== undefined || header(message.payload, 'X-Autorespond') !== undefined) return true;
  const precedence = header(message.payload, 'Precedence')?.toLowerCase();
  if (precedence === 'auto_reply' || precedence === 'auto-reply') return true;
  return subject !== undefined && AUTO_SUBJECT.test(subject);
}

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
const DAY = '\\d{1,2}(?:st|nd|rd|th)?';
const UNTIL = new RegExp(
  `\\b(?:until|till|through|back (?:on|in the office on)|return(?:ing|s)? (?:on|to the office on)|out of (?:the )?office (?:from .*? )?(?:to|until))\\s+(?:the\\s+)?` +
    `(${MONTH}\\.?\\s+${DAY}(?:,?\\s+\\d{4})?|${DAY}\\s+(?:of\\s+)?${MONTH}(?:,?\\s+\\d{4})?|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/.]\\d{1,2}(?:[/.]\\d{2,4})?)`,
  'i',
);

/** A best-effort return date from an auto-reply's subject or snippet (UTC midnight); undefined when none parses. */
export function parseUntil(text: string | undefined, now: Date): Date | undefined {
  if (!text) return undefined;
  const m = UNTIL.exec(text);
  if (!m) return undefined;
  const raw = m[1]!.replace(/(\d)(st|nd|rd|th)\b/gi, '$1').replace(/\bof\b/i, '').replace(/\s+/g, ' ').trim();
  const years = [``, ` ${now.getUTCFullYear()}`, ` ${now.getUTCFullYear() + 1}`];
  for (const year of years) {
    const parsed = Date.parse(`${raw}${year} UTC`);
    if (Number.isNaN(parsed)) continue;
    const date = new Date(parsed);
    if (date.getTime() >= now.getTime() - 24 * 3600 * 1000) return date;
  }
  return undefined;
}
