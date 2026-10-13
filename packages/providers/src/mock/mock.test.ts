import { describe, expect, it } from 'vitest';
import type { ChannelRef } from '@opensequence/core';
import { createMockProviders } from './index.js';

const channel = (over: Partial<ChannelRef> = {}): ChannelRef => ({
  projectId: 'prj_1',
  senderId: 'snd_1',
  channelId: 'chn_email',
  address: 'rep@example.com',
  config: {},
  ...over,
});

describe('mock providers', () => {
  it('records email sends in the outbox and finds them again, idempotently', async () => {
    const p = createMockProviders();
    const sent = await p.email.send({ channel: channel(), to: 'ada@acme.com', subject: 'Hi', text: 'Hello', messageId: '<m1@seq>', headers: {} });
    expect(sent).toEqual({ providerId: 'mock-email:<m1@seq>', threadRef: 'mock-thread:<m1@seq>' });
    expect(await p.email.send({ channel: channel(), to: 'ada@acme.com', subject: 'Hi', text: 'Hello', messageId: '<m1@seq>', headers: {} })).toEqual(sent);
    expect(p.mock.outbox).toHaveLength(1);
    expect(await p.email.findSent({ channel: channel(), messageId: '<m1@seq>' })).toEqual(sent);
    expect(await p.email.findSent({ channel: channel(), messageId: '<nope>' })).toBeNull();

    // A follow-up in the same thread keeps the thread ref.
    const reply = await p.email.send({ channel: channel(), to: 'ada@acme.com', subject: 'Re: Hi', text: 'Bump', messageId: '<m2@seq>', inReplyTo: '<m1@seq>', headers: {} });
    expect(reply.threadRef).toBe('mock-thread:<m1@seq>');
  });

  it('records sms sends and searches by recipient, body and time', async () => {
    const p = createMockProviders({ now: () => new Date('2026-10-13T10:00:00Z') });
    const sms = channel({ channelId: 'chn_sms', address: '+15550000001' });
    expect(await p.sms.send({ channel: sms, to: '+15551234567', body: 'Hey', idempotencyKey: 'run_1' })).toEqual({ providerId: 'mock-sms:run_1' });
    expect(await p.sms.findSent({ channel: sms, to: '+15551234567', body: 'Hey', since: new Date('2026-10-13T09:50:00Z') })).toEqual({ providerId: 'mock-sms:run_1' });
    expect(await p.sms.findSent({ channel: sms, to: '+15551234567', body: 'Hey', since: new Date('2026-10-13T10:01:00Z') })).toBeNull();
    expect(await p.sms.findSent({ channel: sms, to: '+15551234567', body: 'Other', since: new Date(0) })).toBeNull();
  });

  it('delivers pushed events through poll, split by channel, and bookings through the calendar', async () => {
    const p = createMockProviders();
    const at = new Date('2026-10-13T11:00:00Z');
    p.mock.push('prj_1', { kind: 'reply', channel: 'email', externalId: 'e1', occurredAt: at, from: 'ada@acme.com', to: 'rep@example.com', body: 'Sure' });
    p.mock.push('prj_1', { kind: 'opt_out', channel: 'sms', externalId: 'e2', occurredAt: at, from: '+15551234567' });
    p.mock.push('prj_1', { kind: 'meeting_booked', externalId: 'e3', occurredAt: at, attendee: 'ada@acme.com', startsAt: at });
    p.mock.push('prj_2', { kind: 'bounce', channel: 'email', externalId: 'e4', occurredAt: at, address: 'x@y.z', hard: true });

    const emails = await p.email.poll!({ channel: channel(), cursor: null, threadRefs: [], messageIds: [] });
    expect(emails.events.map((e) => e.externalId)).toEqual(['e1']);
    expect(emails.cursor).toBe('1');
    const texts = await p.sms.poll({ channel: channel({ channelId: 'chn_sms' }), cursor: '1', threadRefs: [], messageIds: [] });
    expect(texts.events.map((e) => e.externalId)).toEqual(['e2']);
    expect(texts.cursor).toBe('2');
    const cal = await p.calendar.poll({ connectionId: 'con_1', projectId: 'prj_1', cursor: null });
    expect(cal.events.map((e) => e.externalId)).toEqual(['e3']);
    // Drained: a second poll is empty; the other project's event is untouched.
    expect((await p.email.poll!({ channel: channel(), cursor: '1', threadRefs: [], messageIds: [] })).events).toEqual([]);
    expect(p.mock.pending('prj_2')).toHaveLength(1);
  });

  it('accepts a JSON InboundEvent on the webhook path, reviving dates', async () => {
    const p = createMockProviders();
    const body = Buffer.from(JSON.stringify({ kind: 'reply', channel: 'sms', externalId: 'w1', occurredAt: '2026-10-13T11:00:00Z', from: '+1', to: '+2', body: 'yes' }));
    const [event] = await p.sms.verifyWebhook({ projectId: 'prj_1', headers: {}, rawBody: body, secret: '' });
    expect(event?.kind).toBe('reply');
    expect(event?.occurredAt).toBeInstanceOf(Date);
  });

  it('reports health from the hook', async () => {
    const p = createMockProviders();
    expect(await p.email.health(channel())).toBe('active');
    p.mock.setHealth('chn_email', 'credentials_needed');
    expect(await p.email.health(channel())).toBe('credentials_needed');
    p.mock.setHealth('+15550000001', 'restricted');
    expect(await p.sms.health(channel({ channelId: 'chn_sms', address: '+15550000001' }))).toBe('restricted');
  });

  it('records dialer pushes and reports queue state', async () => {
    const p = createMockProviders();
    const sms = channel({ channelId: 'chn_sms', address: '+15550000001' });
    const res = await p.dialer.pushNumbers({ channel: sms, numbers: [{ number: '+15551234567', name: 'Ada' }], idempotencyKey: 'task_1' });
    expect(res).toEqual({ added: 1, skipped: [] });
    await p.dialer.pushNumbers({ channel: sms, numbers: [{ number: '+15551234567' }], idempotencyKey: 'task_1' });
    expect(p.mock.dialerPushes).toHaveLength(1);
    p.mock.setCallStatus('+15551234567', { callId: 'cll_1', status: 'VOICEMAIL' });
    expect(await p.dialer.queueState!({ channel: sms })).toEqual([{ number: '+15551234567', callId: 'cll_1', status: 'VOICEMAIL' }]);
  });

  it('returns canned CRM data keyed by email, then by domain', async () => {
    const p = createMockProviders({
      crm: {
        byEmail: { 'ada@acme.com': { person: { name: 'Ada' }, deal: { stage: 'In Progress' } } },
        byDomain: { 'acme.com': { company: { name: 'Acme' }, openDeals: 0 } },
      },
    });
    expect(await p.crm.lookup({ projectId: 'prj_1', email: 'Ada@acme.com', domain: 'acme.com', dealSelection: 'newest_open' })).toEqual({
      person: { name: 'Ada' },
      company: null,
      deal: { stage: 'In Progress' },
      openDeals: 1,
    });
    expect(await p.crm.lookup({ projectId: 'prj_1', email: 'bob@acme.com', domain: 'acme.com', dealSelection: 'newest_open' })).toEqual({
      person: null,
      company: { name: 'Acme' },
      deal: null,
      openDeals: 0,
    });
    expect(await p.crm.lookup({ projectId: 'prj_1', email: null, domain: 'other.com', dealSelection: 'any_open' })).toEqual({ person: null, company: null, deal: null, openDeals: 0 });
    expect((await p.crm.schema('prj_1')).objects.map((o) => o.name)).toEqual(['person', 'company', 'deal']);
  });
});
