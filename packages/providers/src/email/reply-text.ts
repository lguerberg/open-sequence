/**
 * What a reply says, without what it quotes: the plain text of an inbound message cut at the
 * quoted history. Mail clients mark it three ways, and each one ends the new text:
 * an attribution line ("On Tue, Oct 13, 2026 at 9:00 AM Ann <ann@x.com> wrote:", wrapped over a
 * few lines by some clients, in a handful of languages), an Outlook header block ("From: … /
 * Sent: … / To: … / Subject: …", often after a rule of underscores or "-----Original
 * Message-----"), and `>` quoted lines, which are dropped wherever they sit.
 */

const ATTRIBUTION_START = /^(on|el|em|le|am|il|op|den)\b/i;
const ATTRIBUTION_END = /(wrote|escribió|escreveu|a écrit|schrieb|scrisse|schreef|skrev)\s*:\s*$/i;
const ORIGINAL_MESSAGE =
  /^-{2,}\s*(original message|forwarded message|mensaje original|message d'origine|ursprüngliche nachricht)\s*-{2,}$/i;
const HEADER_FROM = /^\*?(from|de|von|da|van)\s*:\*?\s*\S/i;
const HEADER_DATE = /^\*?(sent|date|enviado|fecha|gesendet|envoyé|data)\s*:/i;
const HEADER_TO_OR_SUBJECT = /^\*?(to|subject|para|asunto|an|à|objet|betreff|oggetto)\s*:/i;
/** An attribution may wrap over this many lines. */
const ATTRIBUTION_LINES = 3;

/** The new text of a reply; the whole text when stripping would leave nothing. */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const cut = quoteStart(lines);
  const kept = lines
    .slice(0, cut)
    .filter((line) => !/^\s*>/.test(line))
    .join('\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return kept || text.trim();
}

/** The index of the first line of quoted history, or the line count when there is none. */
function quoteStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line || line.startsWith('>')) continue;
    if (ATTRIBUTION_START.test(line) && isAttribution(lines, i)) return i;
    // "Ann <ann@x.com> wrote:" with no "On …" before it, right above the quote.
    if (ATTRIBUTION_END.test(line) && nextNonEmpty(lines, i)?.startsWith('>')) return i;
    if (ORIGINAL_MESSAGE.test(line)) return i;
    if (/^_{10,}$/.test(line) && isHeaderBlock(lines, nextNonEmptyIndex(lines, i))) return i;
    if (isHeaderBlock(lines, i)) return i;
  }
  return lines.length;
}

function isAttribution(lines: string[], i: number): boolean {
  let joined = '';
  for (let j = i; j < Math.min(i + ATTRIBUTION_LINES, lines.length); j++) {
    joined = `${joined} ${lines[j]!.trim()}`.trim();
    if (ATTRIBUTION_END.test(joined)) return true;
  }
  return false;
}

/** "From:" followed within a few lines by a date line and a To or Subject line. */
function isHeaderBlock(lines: string[], i: number): boolean {
  if (i < 0 || i >= lines.length || !HEADER_FROM.test(lines[i]!.trim())) return false;
  const next = lines.slice(i + 1, i + 6).map((l) => l.trim());
  return next.some((l) => HEADER_DATE.test(l)) && next.some((l) => HEADER_TO_OR_SUBJECT.test(l));
}

function nextNonEmptyIndex(lines: string[], i: number): number {
  for (let j = i + 1; j < lines.length; j++) if (lines[j]!.trim()) return j;
  return -1;
}

function nextNonEmpty(lines: string[], i: number): string | undefined {
  const j = nextNonEmptyIndex(lines, i);
  return j < 0 ? undefined : lines[j]!.trim();
}

/** Plain text from an HTML-only reply, cut before the quoted part the client marked up. */
export function htmlReplyText(html: string): string {
  const quote =
    /<(div|blockquote)[^>]*(class="[^"]*(gmail_quote|yahoo_quoted|moz-cite-prefix)[^"]*"|id="(divRplyFwdMsg|appendonsend)")|<blockquote\b/i.exec(
      html
    );
  const own = quote ? html.slice(0, quote.index) : html;
  return own
    .replace(/<(style|script|head)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
