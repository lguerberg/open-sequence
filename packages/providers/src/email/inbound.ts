/**
 * What every mail adapter needs to read inbound mail, independent of how the mailbox is reached:
 * addresses and Message-IDs out of header values, who a bounce comes from, the fields of a
 * delivery-status part, and the auto-reply markers with their "back on" date.
 */

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

const BOUNCE_SENDER = /^(mailer-daemon|postmaster)@/i;

export function isBounceSender(from: string): boolean {
  return BOUNCE_SENDER.test(bareAddress(from));
}

export function isDeliveryStatusType(mimeType: string | undefined): boolean {
  const type = (mimeType ?? '').toLowerCase();
  return type === 'message/delivery-status' || type.startsWith('multipart/report');
}

export interface DeliveryStatus {
  originalMessageId?: string;
  address?: string;
  status?: string;
  reason?: string;
}

/** The per-recipient fields of a `message/delivery-status` body (RFC 3464). */
export function parseStatusFields(text: string): {
  status?: string;
  recipient?: string;
  diagnostic?: string;
} {
  const out: { status?: string; recipient?: string; diagnostic?: string } = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const name = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (name === 'status' && !out.status) out.status = value;
    else if ((name === 'final-recipient' || name === 'original-recipient') && !out.recipient)
      out.recipient = bareAddress(value.replace(/^rfc822;\s*/i, ''));
    else if (name === 'diagnostic-code' && !out.diagnostic)
      out.diagnostic = value.replace(/^smtp;\s*/i, '');
  }
  return out;
}

/** A 4.x.x status is a soft bounce (try again later); anything else, or no code at all, is hard. */
export function isHardBounce(status: string | undefined): boolean {
  return !(status ?? '').startsWith('4');
}

export const AUTO_SUBJECT =
  /^\s*(re:\s*)?(automatic reply|auto(?:matic)?[- ]?(?:reply|response)|out of (?:the )?office|ooo\b|abwesenheit|réponse automatique|respuesta automática)/i;

/** `header(name)` returns the first value of that header or undefined; the subject is checked last. */
export function isAutoReplyHeaders(
  header: (name: string) => string | undefined,
  subject: string | undefined
): boolean {
  const autoSubmitted = header('Auto-Submitted')?.toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') return true;
  if (header('X-Autoreply') !== undefined || header('X-Autorespond') !== undefined) return true;
  const precedence = header('Precedence')?.toLowerCase();
  if (precedence === 'auto_reply' || precedence === 'auto-reply') return true;
  return subject !== undefined && AUTO_SUBJECT.test(subject);
}

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
const DAY = '\\d{1,2}(?:st|nd|rd|th)?';
const UNTIL = new RegExp(
  `\\b(?:until|till|through|back (?:on|in the office on)|return(?:ing|s)? (?:on|to the office on)|out of (?:the )?office (?:from .*? )?(?:to|until))\\s+(?:the\\s+)?` +
    `(${MONTH}\\.?\\s+${DAY}(?:,?\\s+\\d{4})?|${DAY}\\s+(?:of\\s+)?${MONTH}(?:,?\\s+\\d{4})?|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/.]\\d{1,2}(?:[/.]\\d{2,4})?)`,
  'i'
);

/** A best-effort return date from an auto-reply's subject or snippet (UTC midnight); undefined when none parses. */
export function parseUntil(text: string | undefined, now: Date): Date | undefined {
  if (!text) return undefined;
  const m = UNTIL.exec(text);
  if (!m) return undefined;
  const raw = m[1]!
    .replace(/(\d)(st|nd|rd|th)\b/gi, '$1')
    .replace(/\bof\b/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const years = [``, ` ${now.getUTCFullYear()}`, ` ${now.getUTCFullYear() + 1}`];
  for (const year of years) {
    const parsed = Date.parse(`${raw}${year} UTC`);
    if (Number.isNaN(parsed)) continue;
    const date = new Date(parsed);
    if (date.getTime() >= now.getTime() - 24 * 3600 * 1000) return date;
  }
  return undefined;
}
