import { describe, expect, it } from 'vitest';
import { render, templateRefs } from './render.js';

const ctx = {
  contact: { first_name: 'Dana', last_name: '', email: 'dana@example.com', attrs: { company: { name: 'Acme <Co>' } } },
  sender: { name: 'Max Rivera', attrs: { title: 'AE' } },
  sequence: { name: 'UK intro' },
  unsubscribe_url: 'https://seq.example/u/tok',
};

describe('templates', () => {
  it('renders paths and records what it used', () => {
    const r = render('Hi {{ contact.first_name }}, from {{sender.name}} about {{ sequence.name }}', ctx);
    expect(r.text).toBe('Hi Dana, from Max Rivera about UK intro');
    expect(r.used).toEqual({ 'contact.first_name': 'Dana', 'sender.name': 'Max Rivera', 'sequence.name': 'UK intro' });
    expect(r.missing).toEqual([]);
  });

  it('uses the fallback for an empty value and reports a missing one without fallback', () => {
    const r = render('{{ contact.last_name | "there" }} {{ contact.phone }}', ctx);
    expect(r.text).toBe('there ');
    expect(r.missing).toEqual(['contact.phone']);
  });

  it('reads attrs with either root and escapes html when asked', () => {
    expect(render('{{ attrs.company.name }}', ctx).text).toBe('Acme <Co>');
    expect(render('{{ contact.attrs.company.name }}', ctx, { html: true }).text).toBe('Acme &lt;Co&gt;');
  });

  it('inserts the sender signature raw: html in html bodies, text otherwise, fallback when empty', () => {
    const ctx = { contact: {}, sender: { signature: { html: '<b>Max</b><br><a href="https://cal.example">Book</a>', text: 'Max\nBook (https://cal.example)' } }, sequence: { name: 's' } };
    expect(render('Bye\n{{ sender.signature }}', ctx, { html: true }).text).toBe('Bye\n<b>Max</b><br><a href="https://cal.example">Book</a>');
    expect(render('Bye\n{{ sender.signature }}', ctx).text).toBe('Bye\nMax\nBook (https://cal.example)');
    const none = { contact: {}, sender: {}, sequence: { name: 's' } };
    expect(render('{{ sender.signature | "Max" }}', none, { html: true }).text).toBe('Max');
    const r = render('{{ sender.signature }}', none);
    expect(r.text).toBe('');
    expect(r.missing).toEqual(['sender.signature']);
  });

  it('exposes the unsubscribe url and lists refs for validation', () => {
    expect(render('{{ unsubscribe_url }}', ctx).text).toBe('https://seq.example/u/tok');
    expect(templateRefs('{{ a.b }} and {{ contact.attrs.x | "y" }}')).toEqual([{ path: 'a.b' }, { path: 'attrs.x', fallback: 'y' }]);
  });
});
