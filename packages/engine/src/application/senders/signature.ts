/**
 * The sender's email signature. Any rep can write one and it goes into every email they send, so
 * the HTML is sanitized on save with the branded-email allowlist (tables, inline styles, links,
 * hosted or base64 images) and can never carry a script, a form or a tracking frame. Base64
 * images become inline attachments at send time like any other embedded image. The text twin is
 * what `format: "text"` emails render.
 */
import { htmlToText } from '@opensequence/core';
import { sanitizeEmailHtml } from '../email/sanitize-email-html.js';

/** 1 MB: room for a base64 logo. */
export const MAX_SIGNATURE_HTML_CHARS = 1024 * 1024;

export function sanitizeSignature(html: string): string {
  return sanitizeEmailHtml(html);
}

/** A plain-text reading of the signature: line breaks for block tags, links as "text (url)", images as [alt]. */
export function signatureText(html: string): string {
  return htmlToText(html);
}
