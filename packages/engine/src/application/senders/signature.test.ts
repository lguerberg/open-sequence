import { describe, expect, it } from 'vitest';
import { sanitizeEmailHtml } from '../email/sanitize-email-html.js';
import { sanitizeSignature, signatureText } from './signature.js';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('sender signature', () => {
  it("keeps a signature's text, links, image and table, and drops scripts and handlers", () => {
    const html =
      '<table><tr><td><img src="https://cdn.acme.com/max.png" alt="Max" width="64" onerror="x()"></td><td><b>Max Rivera</b><br>Account manager<br><a href="tel:+14155550100">+1 415 555 0100</a> · <a href="https://cal.acme.com/max" target="_blank">Book a call</a></td></tr></table><script>alert(1)</script><img src="javascript:alert(1)">';
    const out = sanitizeSignature(html);
    expect(out).toContain('<img src="https://cdn.acme.com/max.png" alt="Max" width="64" />');
    expect(out).toContain('<a href="https://cal.acme.com/max" target="_blank">Book a call</a>');
    expect(out).not.toContain('script');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('javascript:');
  });

  it('keeps a branded signature: inline styles, a table layout and a base64 logo', () => {
    const html = `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:Arial, sans-serif"><tbody><tr>
      <td valign="top" width="80" style="padding-right:12px;border-right:2px solid #0a66c2"><img src="data:image/png;base64,${PNG}" alt="Acme" width="64" height="64" style="display:block;border-radius:8px"></td>
      <td style="padding-left:12px;font-size:13px;line-height:18px;color:#333333"><strong style="font-size:15px;color:#0a66c2">Max Rivera</strong><br><span style="text-transform:uppercase;letter-spacing:1px">Account manager</span><br>
      <a href="mailto:max@acme.com" style="color:#0a66c2;text-decoration:none">max@acme.com</a></td></tr></tbody></table>`;
    const out = sanitizeSignature(html);
    expect(out).toContain('<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:Arial, sans-serif">');
    expect(out).toContain(`<img src="data:image/png;base64,${PNG}" alt="Acme" width="64" height="64" style="display:block;border-radius:8px" />`);
    expect(out).toContain('style="padding-right:12px;border-right:2px solid #0a66c2"');
    expect(out).toContain('<strong style="font-size:15px;color:#0a66c2">Max Rivera</strong>');
    expect(out).toContain('<span style="text-transform:uppercase;letter-spacing:1px">');
    expect(out).toContain('<a href="mailto:max@acme.com" style="color:#0a66c2;text-decoration:none">');
  });

  it('strips scripts, handlers, forms, frames, javascript: links and CSS that loads or runs something', () => {
    const out = sanitizeEmailHtml(
      [
        '<div onclick="steal()" onmouseover="x()" style="color:red;background:url(https://track.example/p.gif);width:expression(alert(1));position:fixed">Hi</div>',
        '<a href="javascript:alert(1)">bad</a><a href="JaVaScRiPt:alert(1)">bad2</a><a href="data:text/html,<script>x</script>">bad3</a>',
        '<img src="data:text/html;base64,PHNjcmlwdD4=" alt="no"><img src="data:image/svg+xml;base64,PHN2Zz4=" alt="svg"><img src="http://plain.example/a.png" alt="http">',
        '<form action="https://x"><input name="p"></form><iframe src="https://x"></iframe><script>alert(1)</script><style>body{}</style>',
        '<p style="background-color:#fff;color:u\\rl(x)">ok</p>',
      ].join('')
    );
    expect(out).toContain('<div style="color:red">Hi</div>');
    expect(out).not.toMatch(/onclick|onmouseover|url\(|expression|position|javascript|<form|<input|<iframe|<script|<style|data:text|svg|http:\/\/plain/i);
    expect(out).toContain('<a>bad</a>');
    expect(out).toContain('<p style="background-color:#fff">ok</p>');
  });

  it('keeps the email tags: headings, lists, center, blockquote, small, s, hr', () => {
    const html = '<center><h1>A</h1><h6>B</h6><ul><li>c</li></ul><ol><li>d</li></ol><blockquote>e</blockquote><small>f</small><s>g</s><hr></center>';
    expect(sanitizeEmailHtml(html)).toBe('<center><h1>A</h1><h6>B</h6><ul><li>c</li></ul><ol><li>d</li></ol><blockquote>e</blockquote><small>f</small><s>g</s><hr /></center>');
  });

  it('derives a readable text twin, with images as [alt]', () => {
    const text = signatureText(
      '<p><b>Max Rivera</b><br>Account manager</p><p><a href="https://cal.acme.com/max">Book a call</a> &amp; <a href="mailto:max@acme.com">max@acme.com</a></p><img src="https://x/y.png" alt="Acme">'
    );
    expect(text).toBe('Max Rivera\nAccount manager\nBook a call (https://cal.acme.com/max) & max@acme.com\n[Acme]');
  });
});
