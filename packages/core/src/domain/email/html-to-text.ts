/**
 * The plain-text reading of an HTML email or signature: the text part every HTML email carries
 * (multipart/alternative) and a signature's text twin. Line breaks for block tags, links as
 * "label (url)", images as "[alt]" (or nothing without alt), no tags, entities decoded.
 * This reads HTML for display; it is not a sanitizer and never decides what is safe.
 */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(head|style|script|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<!doctype[^>]*>/gi, '')
      // HTML collapses source whitespace; only tags make line breaks.
      .replace(/\s+/g, ' ')
      .replace(/<img\b[^>]*>/gi, (tag) => {
        const alt = attr(tag, 'alt');
        return alt && alt.trim() ? `[${alt.trim()}]` : '';
      })
      .replace(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi, (_m, attrs: string, inner: string) => {
        const href = attr(`<a ${attrs}>`, 'href') ?? '';
        const label = inner.replace(/<[^>]+>/g, '').trim();
        if (!href || href.startsWith('#') || /^cid:/i.test(href)) return label;
        const bare = href.replace(/^(mailto|tel):/i, '');
        const text = decodeEntities(label);
        return text && text !== href && text !== bare ? `${label} (${href})` : bare;
      })
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<hr\b[^>]*>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote|center|ul|ol)\s*>/gi, '\n')
      .replace(/<\/t[dh]\s*>/gi, ' ')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  if (!m) return undefined;
  return decodeEntities(m[1] ?? m[2] ?? m[3] ?? '');
}

const NAMED: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", copy: '©', reg: '®', middot: '·', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return NAMED[code.toLowerCase()] ?? whole;
  });
}
