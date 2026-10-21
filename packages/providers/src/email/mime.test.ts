import { simpleParser } from 'mailparser';
import { describe, expect, it } from 'vitest';
import { emailContent, type ChannelRef, type EmailSendRequest } from '@opensequence/core';
import { buildRfc2822 } from './mime.js';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const GIF = Buffer.alloc(5000, 9).toString('base64');
const channel: ChannelRef = { projectId: 'prj_1', senderId: 'snd_1', channelId: 'sch_1', address: 'max@acme.com', config: {} };

function request(rendered: string, html = true): EmailSendRequest {
  const messageId = '<seq.enr1.email.a1@acme.com>';
  const content = emailContent(rendered, { html, idSuffix: 'seq.enr1.email.a1@acme.com' });
  return { channel, to: 'dana@example.com', subject: 'Your trial', messageId, headers: { 'List-Unsubscribe': '<https://app.acme.com/u/tok>' }, ...content };
}

describe('the MIME message of an html email with embedded images', () => {
  const rendered = `<table role="presentation" width="600" style="background:#f4f4f4"><tr><td><img src="data:image/png;base64,${PNG}" alt="Acme" width="120" height="40"></td></tr><tr><td><p>Hi Dana</p><img src="https://cdn.acme.com/hero.jpg" alt="Hero"><img src="data:image/gif;base64,${GIF}" alt="Divider"><img src="data:image/png;base64,${PNG}" alt="Acme again"></td></tr></table>`;

  it('nests a multipart/related (HTML + inline images) inside multipart/alternative, next to the text part', () => {
    const raw = buildRfc2822(request(rendered));
    const alt = /Content-Type: multipart\/alternative; boundary="([^"]+)"/.exec(raw);
    const rel = /Content-Type: multipart\/related; type="text\/html"; boundary="([^"]+)"/.exec(raw);
    expect(alt && rel).toBeTruthy();
    // Order: text/plain, then the related part holding the HTML, then the images.
    const at = (s: string) => raw.indexOf(s);
    expect(at('Content-Type: text/plain')).toBeLessThan(at('Content-Type: multipart/related'));
    expect(at('Content-Type: multipart/related')).toBeLessThan(at('Content-Type: text/html'));
    expect(at('Content-Type: text/html')).toBeLessThan(at('Content-Type: image/png'));
    expect(raw).toContain('Content-Disposition: inline; filename="image1.png"');
    expect(raw).toContain('Content-ID: <img1.seq.enr1.email.a1@acme.com>');
    expect(raw.split('\r\n').every((line) => line.length <= 998)).toBe(true);
  });

  it('parses back: one inline part per distinct image, a matching cid: in the HTML, hosted images untouched, a text twin', async () => {
    const parsed = await simpleParser(buildRfc2822(request(rendered)));
    expect(parsed.attachments.map((a) => [a.contentType, a.cid, a.contentDisposition, a.related])).toEqual([
      ['image/png', 'img1.seq.enr1.email.a1@acme.com', 'inline', true],
      ['image/gif', 'img2.seq.enr1.email.a1@acme.com', 'inline', true],
    ]);
    expect(parsed.attachments[0]!.content.toString('base64')).toBe(PNG);
    expect(parsed.attachments[1]!.content.length).toBe(5000);
    // As sent, the HTML references the parts by cid:.
    const asSent = await simpleParser(buildRfc2822(request(rendered)), { keepCidLinks: true });
    const html = String(asSent.html);
    expect(html).not.toContain('base64');
    expect(html).toContain('src="cid:img1.seq.enr1.email.a1@acme.com" alt="Acme" width="120" height="40"');
    // A client resolving cid: finds every image: mailparser's default turns each reference back into the image.
    expect(String(parsed.html)).not.toContain('cid:');
    expect(String(parsed.html)).toContain(`data:image/png;base64,${PNG}`);
    expect(parsed.text?.trim()).toBe('[Acme]\nHi Dana\n[Hero][Divider][Acme again]');
    expect(parsed.headerLines.some((h) => h.key === 'list-unsubscribe')).toBe(true);
  });

  it('keeps the cid: references in the HTML part as sent', async () => {
    const raw = buildRfc2822(request(rendered));
    const htmlPart = raw.slice(raw.indexOf('Content-Type: text/html'));
    const qp = htmlPart.slice(htmlPart.indexOf('\r\n\r\n') + 4).split(/\r\n--/)[0]!;
    const html = qp.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
    expect(html.match(/src=(["'])cid:img1\.seq\.enr1\.email\.a1@acme\.com\1/g)).toHaveLength(2);
    expect(html).toContain('src="cid:img2.seq.enr1.email.a1@acme.com" alt="Divider"');
    expect(html).toContain('<img src="https://cdn.acme.com/hero.jpg" alt="Hero">');
    expect(html).toContain('alt="Acme" width="120" height="40"');
  });

  it('sends an html email without embedded images as plain multipart/alternative', async () => {
    const raw = buildRfc2822(request('<p>Hi <img src="https://cdn.acme.com/a.png" alt="A"></p>'));
    expect(raw).not.toContain('multipart/related');
    const parsed = await simpleParser(raw);
    expect(parsed.attachments).toEqual([]);
    expect(String(parsed.html)).toContain('https://cdn.acme.com/a.png');
  });
});
