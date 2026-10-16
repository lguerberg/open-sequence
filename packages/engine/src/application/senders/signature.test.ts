import { describe, expect, it } from 'vitest';
import { sanitizeSignature, signatureText } from './signature.js';

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

  it('derives a readable text twin', () => {
    const text = signatureText(
      '<p><b>Max Rivera</b><br>Account manager</p><p><a href="https://cal.acme.com/max">Book a call</a> &amp; <a href="mailto:max@acme.com">max@acme.com</a></p><img src="https://x/y.png" alt="Acme">'
    );
    expect(text).toBe(
      'Max Rivera\nAccount manager\nBook a call (https://cal.acme.com/max) & max@acme.com\nAcme'
    );
  });
});
