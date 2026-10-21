import type { EmailSendRequest, InlineImage } from '@opensequence/core';

/**
 * Builds the RFC 2822 message the SMTP adapter sends and files in the Sent folder.
 *
 * Text only: one text/plain part. HTML: multipart/alternative with the text twin and the HTML.
 * HTML with embedded images: the HTML and its images go in a multipart/related inside the
 * multipart/alternative, each image an inline part whose Content-ID the HTML names as `cid:`:
 *
 *   multipart/alternative
 *   ├─ text/plain
 *   └─ multipart/related; type="text/html"
 *      ├─ text/html
 *      └─ image/png  (Content-ID, Content-Disposition: inline)
 */
export function buildRfc2822(req: EmailSendRequest, now: Date = new Date()): string {
  const headers: Array<[string, string]> = [
    ['From', req.channel.address],
    ['To', req.to],
    ['Subject', encodeHeaderValue(req.subject)],
    ['Date', now.toUTCString().replace('GMT', '+0000')],
    ['Message-ID', angleBracketed(req.messageId)],
    ['MIME-Version', '1.0'],
  ];
  if (req.inReplyTo) headers.push(['In-Reply-To', angleBracketed(req.inReplyTo)]);
  if (req.references?.length)
    headers.push(['References', req.references.map(angleBracketed).join(' ')]);
  for (const [name, value] of Object.entries(req.headers)) headers.push([name, value]);

  const text = textPart(req.text);
  let body: string;
  if (req.html !== undefined) {
    const boundary = newBoundary();
    headers.push(['Content-Type', `multipart/alternative; boundary="${boundary}"`]);
    const html = req.inlineImages?.length ? relatedPart(req.html, req.inlineImages) : htmlPart(req.html);
    body = [`--${boundary}`, text, `--${boundary}`, html, `--${boundary}--`, ''].join('\r\n');
  } else {
    headers.push(
      ['Content-Type', 'text/plain; charset="UTF-8"'],
      ['Content-Transfer-Encoding', 'quoted-printable']
    );
    body = quotedPrintable(req.text);
  }
  return `${headers.map(([n, v]) => `${n}: ${v}`).join('\r\n')}\r\n\r\n${body}`;
}

function textPart(text: string): string {
  return `Content-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n${quotedPrintable(text)}`;
}

function htmlPart(html: string): string {
  return `Content-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n${quotedPrintable(html)}`;
}

// `=_` never occurs in base64 or quoted-printable output, so the boundary cannot collide with content.
function newBoundary(): string {
  return `=_os_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function relatedPart(html: string, images: InlineImage[]): string {
  const boundary = newBoundary();
  const lines = [`Content-Type: multipart/related; type="text/html"; boundary="${boundary}"`, '', `--${boundary}`, htmlPart(html)];
  for (const image of images) lines.push(`--${boundary}`, imagePart(image));
  lines.push(`--${boundary}--`);
  return lines.join('\r\n');
}

function imagePart(image: InlineImage): string {
  const name = image.filename.replace(/["\\\r\n]/g, '');
  return [
    `Content-Type: ${image.contentType}; name="${name}"`,
    'Content-Transfer-Encoding: base64',
    `Content-ID: ${angleBracketed(image.contentId)}`,
    `Content-Disposition: inline; filename="${name}"`,
    '',
    image.base64.replace(/.{1,76}/g, '$&\r\n').replace(/\r\n$/, ''),
  ].join('\r\n');
}

export function angleBracketed(id: string): string {
  const trimmed = id.trim();
  return trimmed.startsWith('<') ? trimmed : `<${trimmed}>`;
}

/** RFC 2047 encoded-word for a header that is not pure ASCII; ASCII goes through untouched. */
export function encodeHeaderValue(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/** RFC 2045 quoted-printable: UTF-8 bytes, CRLF line endings, soft breaks at 76 columns. */
export function quotedPrintable(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return lines.map(encodeQpLine).join('\r\n');
}

function encodeQpLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  let out = '';
  let column = 0;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]!;
    const last = i === bytes.length - 1;
    let token: string;
    if (byte === 0x3d || byte < 0x20 || byte > 0x7e || ((byte === 0x20 || byte === 0x09) && last)) {
      token = `=${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    } else {
      token = String.fromCharCode(byte);
    }
    if (column + token.length > 75) {
      out += '=\r\n';
      column = 0;
    }
    out += token;
    column += token.length;
  }
  return out;
}
