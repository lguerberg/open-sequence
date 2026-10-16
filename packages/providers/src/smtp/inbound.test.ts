/** The inbound classifier on raw messages: a hard and a soft DSN, an auto-reply with a return date, a threaded reply, noise. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildRfc2822 } from '../email/mime.js';
import {
  classifyInbound,
  indexIds,
  metaFromSource,
  parseBounceSource,
  parseHeaderBlock,
  structureHasDeliveryStatus,
  type InboundScope,
} from './inbound.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(path.join(here, 'fixtures', name));

const now = () => new Date('2026-10-13T12:00:00Z');
const scope: InboundScope = {
  ours: indexIds([
    '<seq.enr1.n1.a1@example.com>',
    '<seq.enr1.n2.a1@example.com>',
    '<seq.enr2.n1.a1@example.com>',
  ]),
  threads: indexIds(['<seq.enr1.n1.a1@example.com>', '<seq.enr2.n1.a1@example.com>']),
  self: 'rep@example.com',
  includeBodies: false,
  now,
};

async function classify(name: string, overrides: Partial<InboundScope> = {}) {
  const source = fixture(name);
  const meta = await metaFromSource(source);
  return classifyInbound(meta, { ...scope, ...overrides }, async () => source);
}

describe('bounces', () => {
  it('reads a hard DSN: the recipient, the 5.x.x status, the diagnostic and our Message-ID from the attached original', async () => {
    const event = await classify('bounce-hard.eml');
    expect(event).toMatchObject({
      kind: 'bounce',
      channel: 'email',
      externalId: 'dsn-1@mail.example.net',
      address: 'lead@acme.com',
      hard: true,
      originalMessageId: '<seq.enr1.n1.a1@example.com>',
      reason: '550 5.1.1 <lead@acme.com>: Recipient address rejected: User unknown',
    });
    expect(event?.occurredAt.toISOString()).toBe('2026-10-13T10:05:00.000Z');
  });

  it('reads a soft DSN (4.x.x) with text/rfc822-headers as the original', async () => {
    const event = await classify('bounce-soft.eml');
    expect(event).toMatchObject({
      kind: 'bounce',
      address: 'full@acme.com',
      hard: false,
      originalMessageId: '<seq.enr2.n1.a1@example.com>',
      reason: '452 4.2.2 Mailbox full',
    });
  });

  it('ignores a bounce about a message that is not ours', async () => {
    const event = await classify('bounce-hard.eml', {
      ours: indexIds(['<other@example.com>']),
      threads: new Map(),
    });
    expect(event).toBeNull();
  });

  it('parseBounceSource prefers an id of ours over other ids the report mentions', async () => {
    const status = await parseBounceSource(
      fixture('bounce-hard.eml'),
      indexIds(['<seq.enr1.n1.a1@example.com>'])
    );
    expect(status.originalMessageId).toBe('seq.enr1.n1.a1@example.com');
    expect(status.status).toBe('5.1.1');
  });
});

describe('replies', () => {
  it('a reply in one of our threads: inReplyTo and threadRef in the engine spelling, no body by default', async () => {
    const event = await classify('reply.eml');
    expect(event).toMatchObject({
      kind: 'reply',
      channel: 'email',
      externalId: 'reply-1@acme.com',
      from: 'dana@acme.com',
      to: 'rep@example.com',
      subject: 'Re: Quick question',
      inReplyTo: '<seq.enr1.n2.a1@example.com>',
      threadRef: '<seq.enr1.n1.a1@example.com>',
    });
    expect(event?.kind === 'reply' ? event.body : 'set').toBeUndefined();
    expect(event?.kind === 'reply' ? event.autoReply : 'set').toBeUndefined();
  });

  it('fetches the text body when asked', async () => {
    const event = await classify('reply.eml', { includeBodies: true });
    expect(event?.kind === 'reply' ? event.body : null).toBe('Sure, let’s talk Thursday.');
  });

  it('an auto-reply carries autoReply.until from its text', async () => {
    const event = await classify('auto-reply.eml', { includeBodies: true });
    expect(event?.kind).toBe('reply');
    expect(event?.kind === 'reply' ? event.autoReply?.until?.toISOString() : null).toBe(
      '2026-10-20T00:00:00.000Z'
    );
  });

  it('an auto-reply keeps its return date when bodies are off, without keeping the body', async () => {
    const event = await classify('auto-reply.eml');
    expect(event?.kind === 'reply' ? event.autoReply?.until?.toISOString() : null).toBe(
      '2026-10-20T00:00:00.000Z'
    );
    expect(event?.kind === 'reply' ? event.body : 'set').toBeUndefined();
  });

  it('an auto-reply is flagged by its headers alone when its text names no date', async () => {
    const source = Buffer.from(
      fixture('auto-reply.eml')
        .toString('utf8')
        .replace(/I am out of the office.*$/s, 'Thanks for your message.\n')
    );
    const event = await classifyInbound(await metaFromSource(source), scope, async () => source);
    expect(event?.kind === 'reply' ? event.autoReply : null).toEqual({});
  });

  it('ignores mail outside our threads, and mail from the sender themself', async () => {
    expect(await classify('unrelated.eml')).toBeNull();
    const source = Buffer.from(
      buildRfc2822({
        channel: {
          projectId: 'p',
          senderId: 's',
          channelId: 'c',
          address: 'rep@example.com',
          config: {},
        },
        to: 'dana@acme.com',
        subject: 'x',
        text: 'x',
        messageId: '<seq.enr1.n1.a1@example.com>',
        headers: {},
      })
    );
    const meta = await metaFromSource(source);
    expect(await classifyInbound(meta, scope, async () => source)).toBeNull();
  });
});

describe('IMAP plumbing', () => {
  it('unfolds a HEADER.FIELDS block', () => {
    const block = Buffer.from(
      'References: <a@x>\r\n <b@x>\r\nAuto-Submitted: auto-replied\r\n\r\n'
    );
    expect(parseHeaderBlock(block)).toEqual([
      ['references', '<a@x> <b@x>'],
      ['auto-submitted', 'auto-replied'],
    ]);
  });

  it('finds a delivery-status part anywhere in the body structure', () => {
    expect(
      structureHasDeliveryStatus({
        type: 'multipart/mixed',
        childNodes: [
          { type: 'text/plain' },
          { type: 'multipart/report', childNodes: [{ type: 'message/delivery-status' }] },
        ],
      })
    ).toBe(true);
    expect(
      structureHasDeliveryStatus({
        type: 'multipart/alternative',
        childNodes: [{ type: 'text/plain' }, { type: 'text/html' }],
      })
    ).toBe(false);
  });
});
