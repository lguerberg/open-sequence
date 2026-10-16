import { bareAddress, isAutoReplyHeaders, isDeliveryStatusType, messageIdsIn, parseStatusFields, type DeliveryStatus } from '../email/inbound.js';
import { decodeBase64url } from './mime.js';

// The mailbox-agnostic helpers live in ../email/inbound.ts; the Gmail names stay importable from here.
export { bareAddress, messageIdsIn, normalizeMessageId, isBounceSender, parseUntil, type DeliveryStatus } from '../email/inbound.js';

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

export function hasDeliveryStatusPart(message: GmailMessage): boolean {
  for (const part of walkParts(message.payload)) {
    if (isDeliveryStatusType(part.mimeType)) return true;
  }
  return false;
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

export function isAutoReply(message: GmailMessage, subject: string | undefined): boolean {
  return isAutoReplyHeaders((name) => header(message.payload, name), subject);
}
