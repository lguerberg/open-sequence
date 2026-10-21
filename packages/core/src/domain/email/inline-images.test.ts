import { describe, expect, it } from 'vitest';
import { emailContent } from './email-content.js';
import { htmlToText } from './html-to-text.js';
import { EMAIL_LIMITS, EmailContentError, embeddedImageBytes, extractInlineImages } from './inline-images.js';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const bytesOf = (n: number, fill: number) => Buffer.alloc(n, fill).toString('base64');
const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return err instanceof EmailContentError ? err.code : String(err);
  }
  return null;
};

describe('embedded images become inline parts', () => {
  it('replaces a data URI with cid:, keeps alt, width, height and style, and leaves hosted images alone', () => {
    const html = `<table><tr><td><img alt="Acme" width="120" height="40" style="display:block" src="data:image/png;base64,${PNG}"></td><td><img src="https://cdn.acme.com/banner.png" alt="Banner"></td></tr></table>`;
    const out = extractInlineImages(html, { idSuffix: 'm1@acme.com' });
    expect(out.images).toHaveLength(1);
    expect(out.images[0]).toMatchObject({ contentId: 'img1.m1@acme.com', contentType: 'image/png', filename: 'image1.png', base64: PNG });
    expect(out.html).toContain('<img alt="Acme" width="120" height="40" style="display:block" src="cid:img1.m1@acme.com">');
    expect(out.html).toContain('<img src="https://cdn.acme.com/banner.png" alt="Banner">');
    expect(out.html).not.toContain('base64');
  });

  it('makes one part of identical images, even wrapped differently, and one per distinct image', () => {
    const wrapped = PNG.replace(/(.{20})/g, '$1\n');
    const jpeg = bytesOf(300, 1);
    const html = `<img src="data:image/png;base64,${PNG}" alt="a"><img src='data:image/png;base64,${wrapped}' alt="b"><img src="data:image/jpg;base64,${jpeg}"><img src="data:image/png;base64,${PNG}">`;
    const out = extractInlineImages(html, { idSuffix: 'x@y' });
    expect(out.images.map((i) => [i.contentId, i.contentType])).toEqual([
      ['img1.x@y', 'image/png'],
      ['img2.x@y', 'image/jpeg'],
    ]);
    expect(out.html.match(/cid:img1\.x@y/g)).toHaveLength(3);
    expect(out.html).toContain(`src='cid:img1.x@y' alt="b"`);
  });

  it('ignores data-src, svg and non-image data URIs', () => {
    const html = `<img data-src="data:image/png;base64,${PNG}" src="https://x.test/a.png"><img src="data:image/svg+xml;base64,${PNG}">`;
    const out = extractInlineImages(html, { idSuffix: 'x@y' });
    expect(out.images).toEqual([]);
    expect(out.html).toBe(html);
  });

  it('fails an image over 1 MB with IMAGE_TOO_LARGE, never truncating it', () => {
    const big = bytesOf(EMAIL_LIMITS.maxImageBytes + 1, 3);
    expect(codeOf(() => extractInlineImages(`<img src="data:image/png;base64,${big}">`, { idSuffix: 'x@y' }))).toBe('IMAGE_TOO_LARGE');
    const exact = bytesOf(EMAIL_LIMITS.maxImageBytes, 3);
    expect(extractInlineImages(`<img src="data:image/png;base64,${exact}">`, { idSuffix: 'x@y' }).images[0]!.bytes).toBe(EMAIL_LIMITS.maxImageBytes);
  });

  it('fails a message over 10 MB with MESSAGE_TOO_LARGE', () => {
    const imgs = Array.from({ length: 11 }, (_, i) => `<img src="data:image/gif;base64,${bytesOf(1000 * 1000, i + 10)}">`).join('');
    expect(codeOf(() => emailContent(imgs, { html: true, idSuffix: 'x@y' }))).toBe('MESSAGE_TOO_LARGE');
    const ok = emailContent(imgs.split('<img').slice(0, 4).join('<img'), { html: true, idSuffix: 'x@y' });
    expect(ok.inlineImages).toHaveLength(3);
  });

  it('counts distinct embedded bytes for the HEAVY_EMAIL warning', () => {
    const a = bytesOf(1000, 1);
    expect(embeddedImageBytes(`<img src="data:image/png;base64,${a}"><img src="data:image/png;base64,${a}"><img src="https://x/y.png">`)).toBe(1000);
  });
});

describe('the text alternative', () => {
  it('reads images as [alt], links as label (url), and drops head, style and comments', () => {
    const html = `<!doctype html><html><head><title>T</title><style>p{color:red}</style></head><body><!-- preheader -->
      <table><tr><td><img src="cid:img1.x@y" alt="Acme logo"></td></tr>
      <tr><td><h1>Hi Dana,</h1><p>Your   trial &amp; your data are ready.</p>
      <p><a href="https://app.acme.com/start?a=1&amp;b=2" style="color:#fff">Get started</a></p>
      <p><img src="https://x/y.png"> <a href="mailto:max@acme.com">max@acme.com</a></p></td></tr></table></body></html>`;
    expect(htmlToText(html)).toBe('[Acme logo]\nHi Dana,\nYour trial & your data are ready.\nGet started (https://app.acme.com/start?a=1&b=2)\nmax@acme.com');
  });

  it('is what an html email carries next to the HTML', () => {
    const c = emailContent(`<p>Hello</p><img alt="Logo" src="data:image/png;base64,${PNG}">`, { html: true, idSuffix: 'x@y' });
    expect(c.text).toBe('Hello\n[Logo]');
    expect(c.html).toBe('<p>Hello</p><img alt="Logo" src="cid:img1.x@y">');
    expect(emailContent('plain', { html: false, idSuffix: 'x@y' })).toEqual({ text: 'plain' });
  });
});
