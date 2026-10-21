/**
 * An allowlist for branded email HTML: the table layouts, inline styles and images an email
 * builder (Customer.io, Mailchimp, a hand-written template) produces, and nothing that runs code
 * or phones home. Signatures go through it on save, because any rep can write one. Email bodies
 * are written by the project's admins and are sent as written; call this on a body only when it
 * comes from someone you trust less.
 *
 * Kept: table, tbody, thead, tr, td, th, div, span, p, br, hr, a, img, b, strong, i, em, u, s,
 * small, font, h1 to h6, ul, ol, li, center, blockquote; layout attributes; inline styles limited
 * to a CSS property allowlist; links over http, https, mailto and tel; images over https or as
 * data:image/(png|jpeg|gif|webp);base64. Dropped: scripts, event handlers, forms, frames, and any
 * CSS that loads or runs something (url(), expression(), javascript:).
 */
import sanitizeHtml from 'sanitize-html';

const TAGS = ['table', 'tbody', 'thead', 'tr', 'td', 'th', 'div', 'span', 'p', 'br', 'hr', 'a', 'img', 'b', 'strong', 'i', 'em', 'u', 's', 'small', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'center', 'blockquote'];

const SIDES = ['top', 'right', 'bottom', 'left'];
const CSS_PROPERTIES = [
  'color',
  'background',
  'background-color',
  'font',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'font-variant',
  'font-stretch',
  'text-align',
  'text-decoration',
  'text-decoration-color',
  'text-decoration-line',
  'text-decoration-style',
  'text-transform',
  'text-indent',
  'text-overflow',
  'line-height',
  'letter-spacing',
  'margin',
  ...SIDES.map((s) => `margin-${s}`),
  'padding',
  ...SIDES.map((s) => `padding-${s}`),
  'border',
  'border-color',
  'border-width',
  'border-style',
  'border-collapse',
  'border-spacing',
  ...SIDES.flatMap((s) => [`border-${s}`, `border-${s}-color`, `border-${s}-width`, `border-${s}-style`]),
  'border-radius',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'width',
  'height',
  'max-width',
  'min-width',
  'display',
  'vertical-align',
];

// Any value, unless it loads or runs something. Backslashes are refused so `u\rl(` cannot sneak by.
const SAFE_CSS_VALUE = /^(?![\s\S]*(?:url\s*\(|expression\s*\(|javascript\s*:|vbscript\s*:|-moz-binding|behavior|@import|\\|<|>))[\s\S]*$/i;

const IMAGE_SRC = /^(?:https:\/\/|data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$)/i;

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: TAGS,
  allowedAttributes: {
    '*': ['style', 'align', 'valign', 'width', 'height', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'title'],
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt'],
    font: ['color', 'face', 'size'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['https', 'data'] },
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  parseStyleAttributes: true,
  allowedStyles: { '*': Object.fromEntries(CSS_PROPERTIES.map((p) => [p, [SAFE_CSS_VALUE]])) },
  // A data: src is only ever an image in one of four formats, base64; anything else loses its src.
  transformTags: {
    img: (tagName, attribs) => {
      const src = attribs['src']?.trim();
      const out = { ...attribs };
      if (!src || !IMAGE_SRC.test(src)) delete out['src'];
      return { tagName, attribs: out };
    },
  },
  // An image left without a source shows nothing; drop it.
  exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs['src'],
  disallowedTagsMode: 'discard',
};

export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}
