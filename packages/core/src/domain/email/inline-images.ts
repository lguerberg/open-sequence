/**
 * Branded HTML emails carry their images one of two ways: hosted (`<img src="https://…">`), left
 * exactly as written, or embedded (`<img src="data:image/png;base64,…">`). Gmail, Outlook and
 * Apple Mail do not show data URIs, so at send time every embedded image becomes an inline MIME
 * part (multipart/related) and its `src` becomes `cid:<content-id>`. Identical images share one
 * part. The limits fail the step with a stable code; nothing is ever silently truncated.
 */

export const EMAIL_LIMITS = {
  /** One embedded image, decoded. */
  maxImageBytes: 1024 * 1024,
  /** The whole message as sent: both bodies plus the encoded images. */
  maxMessageBytes: 10 * 1024 * 1024,
  /** Above this many decoded bytes of embedded images, the validator warns HEAVY_EMAIL. */
  heavyImageBytes: 400 * 1024,
} as const;

export interface InlineImage {
  /** The Content-ID without angle brackets; the HTML references it as `cid:<contentId>`. */
  contentId: string;
  contentType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  filename: string;
  /** The image, base64 without whitespace. */
  base64: string;
  /** Decoded size. */
  bytes: number;
}

export type EmailContentErrorCode = 'IMAGE_TOO_LARGE' | 'MESSAGE_TOO_LARGE';

/** A message that can never be sent as written: retrying will not help. */
export class EmailContentError extends Error {
  constructor(
    readonly code: EmailContentErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'EmailContentError';
  }
}

// `<img … src="data:image/png;base64,…">`. `\s` before src so `data-src` is not matched; the
// payload may be wrapped over several lines.
const DATA_IMG = /(<img\b[^>]*?\ssrc\s*=\s*)(["'])\s*data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=\s]*)\2/gi;

function typeOf(subtype: string): InlineImage['contentType'] {
  const s = subtype.toLowerCase();
  return s === 'jpg' || s === 'jpeg' ? 'image/jpeg' : (`image/${s}` as InlineImage['contentType']);
}

/** Decoded length of a base64 string without whitespace. */
export function base64DecodedBytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The distinct embedded images of an HTML body, without changing it (for the HEAVY_EMAIL warning). */
export function embeddedImageBytes(html: string): number {
  const seen = new Set<string>();
  let total = 0;
  for (const m of html.matchAll(DATA_IMG)) {
    const base64 = m[4]!.replace(/\s+/g, '');
    const key = `${typeOf(m[3]!)};${base64}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += base64DecodedBytes(base64);
  }
  return total;
}

/**
 * Replaces every embedded image with `cid:` and returns the parts to attach. `idSuffix` makes the
 * Content-IDs unique to the message (the Message-ID without brackets is a good one: `id@domain`).
 * Every other attribute of the tag (alt, width, height, style) is kept; hosted images are untouched.
 */
export function extractInlineImages(html: string, opts: { idSuffix: string; maxImageBytes?: number }): { html: string; images: InlineImage[] } {
  const maxImageBytes = opts.maxImageBytes ?? EMAIL_LIMITS.maxImageBytes;
  const byContent = new Map<string, InlineImage>();
  const out = html.replace(DATA_IMG, (_whole, prefix: string, quote: string, subtype: string, payload: string) => {
    const base64 = payload.replace(/\s+/g, '');
    const contentType = typeOf(subtype);
    const key = `${contentType};${base64}`;
    let image = byContent.get(key);
    if (!image) {
      const bytes = base64DecodedBytes(base64);
      if (bytes > maxImageBytes) {
        throw new EmailContentError('IMAGE_TOO_LARGE', `An embedded image is ${mb(bytes)}; the limit is ${mb(maxImageBytes)} per image. Shrink it, or host it and link it with an https src.`);
      }
      const n = byContent.size + 1;
      const ext = contentType.slice('image/'.length).replace('jpeg', 'jpg');
      image = { contentId: `img${n}.${opts.idSuffix}`, contentType, filename: `image${n}.${ext}`, base64, bytes };
      byContent.set(key, image);
    }
    return `${prefix}${quote}cid:${image.contentId}${quote}`;
  });
  return { html: out, images: [...byContent.values()] };
}

/**
 * The size of the message as it goes on the wire, near enough: both bodies, and every image as
 * base64 in 76-column lines, plus room for the headers and the MIME boundaries.
 */
export function emailMessageBytes(parts: { html?: string; text: string; images?: InlineImage[] }): number {
  const images = (parts.images ?? []).reduce((sum, i) => sum + i.base64.length + 2 * Math.ceil(i.base64.length / 76) + 256, 0);
  return Buffer.byteLength(parts.text, 'utf8') + (parts.html ? Buffer.byteLength(parts.html, 'utf8') : 0) + images + 4096;
}

/** Throws MESSAGE_TOO_LARGE when the message would exceed the limit. */
export function assertEmailMessageSize(parts: { html?: string; text: string; images?: InlineImage[] }, maxMessageBytes: number = EMAIL_LIMITS.maxMessageBytes): void {
  const bytes = emailMessageBytes(parts);
  if (bytes > maxMessageBytes) {
    throw new EmailContentError('MESSAGE_TOO_LARGE', `The email is ${mb(bytes)} with its images; the limit is ${mb(maxMessageBytes)}. Host the images over https, or use fewer or smaller ones.`);
  }
}
