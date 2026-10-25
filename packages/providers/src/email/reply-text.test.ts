/** Reply text without the quoted history: Gmail, Apple Mail, Outlook and `>` quotes. */
import { describe, expect, it } from 'vitest';
import { htmlReplyText, stripQuotedReply } from './reply-text.js';

describe('stripQuotedReply', () => {
  it('cuts at a Gmail attribution, wrapped over two lines', () => {
    const text = [
      'Thursday works.',
      '',
      'Dana',
      '',
      'On Tue, Oct 13, 2026 at 9:00 AM Ann Tester <ann@example.com>',
      'wrote:',
      '',
      '> Hi Dana, quick question?',
      '>',
    ].join('\n');
    expect(stripQuotedReply(text)).toBe('Thursday works.\n\nDana');
  });

  it('cuts at an Apple Mail and a Spanish attribution', () => {
    expect(
      stripQuotedReply('Yes.\n\nOn Oct 13, 2026, at 09:00, Ann <ann@example.com> wrote:\n\n> Hi')
    ).toBe('Yes.');
    expect(
      stripQuotedReply(
        'Dale.\n\nEl mar, 13 oct 2026 a las 9:00, Ann (<ann@example.com>) escribió:\n> Hola'
      )
    ).toBe('Dale.');
  });

  it('cuts at an Outlook header block, with or without the underscore rule', () => {
    const outlook = [
      'Please call me tomorrow.',
      '',
      '________________________________',
      'From: Ann Tester <ann@example.com>',
      'Sent: Tuesday, October 13, 2026 9:00 AM',
      'To: Dana Lee <dana@acme.com>',
      'Subject: Quick question',
      '',
      'Hi Dana,',
    ].join('\n');
    expect(stripQuotedReply(outlook)).toBe('Please call me tomorrow.');
    expect(stripQuotedReply(outlook.replace('________________________________\n', ''))).toBe(
      'Please call me tomorrow.'
    );
    expect(stripQuotedReply('Sure.\n\n-----Original Message-----\nFrom: Ann\nHi')).toBe('Sure.');
  });

  it('drops > quoted lines wherever they sit, keeping interleaved answers', () => {
    const text = '> Does Thursday work?\nYes, 3pm.\n> Who else joins?\nJust me.';
    expect(stripQuotedReply(text)).toBe('Yes, 3pm.\nJust me.');
  });

  it('keeps a sentence that only starts with "On"', () => {
    expect(stripQuotedReply('On Thursday I am free.\nCall me then.')).toBe(
      'On Thursday I am free.\nCall me then.'
    );
  });

  it('keeps the whole text when stripping would leave nothing', () => {
    expect(stripQuotedReply('> only a quote')).toBe('> only a quote');
  });
});

describe('htmlReplyText', () => {
  it('cuts before the gmail_quote and turns breaks into lines', () => {
    const html =
      '<div dir="ltr">Thursday works.<br>Dana &amp; team</div><br><div class="gmail_quote"><div class="gmail_attr">On Tue wrote:</div><blockquote>Hi</blockquote></div>';
    expect(htmlReplyText(html)).toBe('Thursday works.\nDana & team');
  });
});
