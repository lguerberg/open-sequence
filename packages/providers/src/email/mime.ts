import type { EmailSendRequest } from '@opensequence/core';

/** Builds the RFC 2822 message Gmail's `messages.send` takes as `raw`, and encodes it base64url. */
export function buildRawMessage(req: EmailSendRequest, now: Date = new Date()): string {
  return base64url(Buffer.from(buildRfc2822(req, now), 'utf8'));
}

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
    const boundary = `=_os_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    headers.push(['Content-Type', `multipart/alternative; boundary="${boundary}"`]);
    body = [`--${boundary}`, text, `--${boundary}`, htmlPart(req.html), `--${boundary}--`, ''].join(
      '\r\n'
    );
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

export function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeBase64url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}
