/**
 * The sender's email signature. The HTML is kept to the tags and attributes a signature needs
 * (text, links, an image, a small table for layout) so a signature can never carry a script, a
 * form or a tracking frame into every email the sender sends. The text twin is what `format:
 * "text"` emails render.
 */
import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'a',
  'b',
  'br',
  'div',
  'em',
  'font',
  'hr',
  'i',
  'img',
  'li',
  'ol',
  'p',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'tr',
  'u',
  'ul',
];

export function sanitizeSignature(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      '*': [
        'style',
        'align',
        'valign',
        'width',
        'height',
        'border',
        'cellpadding',
        'cellspacing',
        'color',
        'bgcolor',
      ],
      a: ['href', 'target', 'rel', 'title'],
      img: ['src', 'alt', 'title'],
      font: ['face', 'size'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    // Inline styles are common in signatures; sanitize-html drops unsafe values (url(), expression()) by itself.
    parseStyleAttributes: true,
  }).trim();
}

/** A plain-text reading of the signature: line breaks for block tags, links as "text (url)", no tags. */
export function signatureText(html: string): string {
  return html
    .replace(
      /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_m, href: string, label: string) => {
        const text = label.replace(/<[^>]+>/g, '').trim();
        const bare = href.replace(/^(mailto|tel):/, '');
        return text && text !== href && text !== bare ? `${text} (${href})` : bare;
      }
    )
    .replace(/<img\b[^>]*alt="([^"]*)"[^>]*>/gi, '$1')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<\/(p|div|tr|li|h[1-6])>|<br\s*\/?>|<hr\s*\/?>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
