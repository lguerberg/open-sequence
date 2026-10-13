import type { ChannelRef } from '@opensequence/core';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GmailEmailProvider } from './gmail-email-provider.js';
import { decodeBase64url } from './mime.js';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const tokens = { accessToken: async (id: string) => `tok-${id}` };
const channel: ChannelRef = { projectId: 'prj_1', senderId: 'snd_1', channelId: 'chn_1', connectionId: 'con_1', address: 'rep@example.com', config: {} };
const provider = () => new GmailEmailProvider(tokens, { now: () => new Date('2026-10-13T10:00:00Z') });

const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function message(id: string, threadId: string, headers: Record<string, string>, extra: Record<string, unknown> = {}) {
  return { id, threadId, internalDate: '1760349600000', snippet: '', payload: { mimeType: 'text/plain', headers: Object.entries(headers).map(([name, value]) => ({ name, value })) }, ...extra };
}

describe('send', () => {
  it('posts a base64url RFC 2822 message with our Message-ID and the unsubscribe headers', async () => {
    let posted: { raw: string; threadId?: string } | undefined;
    let auth: string | null = null;
    server.use(
      http.post(`${API}/messages/send`, async ({ request }) => {
        auth = request.headers.get('authorization');
        posted = (await request.json()) as { raw: string };
        return HttpResponse.json({ id: 'msg_1', threadId: 'thr_1' });
      }),
    );
    const result = await provider().send({
      channel,
      to: 'lead@acme.com',
      subject: 'Quick question — café',
      text: 'Hello = world',
      html: '<p>Hello</p>',
      messageId: 'seq:enr_1:n1:a1@opensequence',
      headers: { 'List-Unsubscribe': '<https://seq.example/u/tok>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    });
    expect(result).toEqual({ providerId: 'msg_1', threadRef: 'thr_1' });
    expect(auth).toBe('Bearer tok-con_1');
    expect(posted?.raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(posted?.threadId).toBeUndefined();
    const raw = decodeBase64url(posted!.raw);
    expect(raw).toContain('From: rep@example.com\r\n');
    expect(raw).toContain('To: lead@acme.com\r\n');
    expect(raw).toContain('Message-ID: <seq:enr_1:n1:a1@opensequence>\r\n');
    expect(raw).toContain('List-Unsubscribe: <https://seq.example/u/tok>\r\n');
    expect(raw).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n');
    expect(raw).toContain('Subject: =?UTF-8?B?UXVpY2sgcXVlc3Rpb24g4oCUIGNhZsOp?=\r\n');
    expect(raw).toContain('Date: Tue, 13 Oct 2026 10:00:00 +0000\r\n');
    expect(raw).toContain('Content-Type: multipart/alternative; boundary=');
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nHello =3D world');
    expect(raw).toContain('Content-Type: text/html; charset="UTF-8"');
  });

  it('threads a reply with the threadRef the executor passes, without a lookup', async () => {
    let posted: { raw: string; threadId?: string } | undefined;
    server.use(
      http.get(`${API}/messages`, () => HttpResponse.json({ error: { code: 500, message: 'lookup should not happen' } }, { status: 500 })),
      http.post(`${API}/messages/send`, async ({ request }) => {
        posted = (await request.json()) as { raw: string; threadId?: string };
        return HttpResponse.json({ id: 'msg_2', threadId: 'thr_1' });
      }),
    );
    const result = await provider().send({
      channel,
      to: 'lead@acme.com',
      subject: 'Re: Quick question',
      text: 'Bumping this.',
      messageId: 'seq:enr_1:n3:a1@opensequence',
      inReplyTo: 'seq:enr_1:n1:a1@opensequence',
      threadRef: 'thr_1',
      headers: {},
    });
    expect(result).toEqual({ providerId: 'msg_2', threadRef: 'thr_1' });
    expect(posted?.threadId).toBe('thr_1');
  });

  it('falls back to a rfc822msgid lookup when a reply has no threadRef', async () => {
    let posted: { raw: string; threadId?: string } | undefined;
    server.use(
      http.get(`${API}/messages`, ({ request }) => {
        expect(new URL(request.url).searchParams.get('q')).toBe('rfc822msgid:seq:enr_1:n1:a1@opensequence');
        return HttpResponse.json({ messages: [{ id: 'msg_1', threadId: 'thr_1' }] });
      }),
      http.post(`${API}/messages/send`, async ({ request }) => {
        posted = (await request.json()) as { raw: string; threadId?: string };
        return HttpResponse.json({ id: 'msg_2', threadId: 'thr_1' });
      }),
    );
    await provider().send({
      channel,
      to: 'lead@acme.com',
      subject: 'Re: Quick question',
      text: 'Bumping this.',
      messageId: 'seq:enr_1:n3:a1@opensequence',
      inReplyTo: 'seq:enr_1:n1:a1@opensequence',
      references: ['seq:enr_1:n1:a1@opensequence'],
      headers: {},
    });
    expect(posted?.threadId).toBe('thr_1');
    const raw = decodeBase64url(posted!.raw);
    expect(raw).toContain('In-Reply-To: <seq:enr_1:n1:a1@opensequence>\r\n');
    expect(raw).toContain('References: <seq:enr_1:n1:a1@opensequence>\r\n');
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nBumping this.');
  });

  it('surfaces a 401 as credentials_needed', async () => {
    server.use(http.post(`${API}/messages/send`, () => HttpResponse.json({ error: { code: 401, message: 'Invalid Credentials' } }, { status: 401 })));
    await expect(provider().send({ channel, to: 'a@b.c', subject: 's', text: 't', messageId: 'm@x', headers: {} })).rejects.toThrow(/^credentials_needed/);
  });

  it('marks 429 and quota 403 as transient', async () => {
    server.use(http.post(`${API}/messages/send`, () => HttpResponse.json({ error: { code: 429, message: 'Too many' } }, { status: 429 })));
    await expect(provider().send({ channel, to: 'a@b.c', subject: 's', text: 't', messageId: 'm@x', headers: {} })).rejects.toMatchObject({ status: 429, transient: true });
    server.use(
      http.post(`${API}/messages/send`, () => HttpResponse.json({ error: { code: 403, message: 'User-rate limit exceeded.', errors: [{ reason: 'userRateLimitExceeded' }] } }, { status: 403 })),
    );
    await expect(provider().send({ channel, to: 'a@b.c', subject: 's', text: 't', messageId: 'm@x', headers: {} })).rejects.toMatchObject({ status: 403, transient: true });
  });
});

describe('findSent', () => {
  it('returns the id and thread for a hit and null for none', async () => {
    server.use(
      http.get(`${API}/messages`, ({ request }) => {
        const q = new URL(request.url).searchParams.get('q');
        return q === 'rfc822msgid:hit@opensequence' ? HttpResponse.json({ messages: [{ id: 'msg_9', threadId: 'thr_9' }] }) : HttpResponse.json({ resultSizeEstimate: 0 });
      }),
    );
    expect(await provider().findSent({ channel, messageId: '<hit@opensequence>' })).toEqual({ providerId: 'msg_9', threadRef: 'thr_9' });
    expect(await provider().findSent({ channel, messageId: 'miss@opensequence' })).toBeNull();
  });
});

describe('poll', () => {
  it('bootstraps from the profile when there is no cursor', async () => {
    server.use(http.get(`${API}/profile`, () => HttpResponse.json({ emailAddress: 'rep@example.com', historyId: '5000' })));
    expect(await provider().poll({ channel, cursor: null, threadRefs: [], messageIds: [] })).toEqual({ events: [], cursor: '5000' });
  });

  it('keeps replies in our threads or answering our ids, flags auto-replies and maps bounces', async () => {
    const ours = 'seq:enr_1:n1:a1@opensequence';
    const bounce = {
      id: 'm_bounce',
      threadId: 'thr_other',
      internalDate: '1760349600000',
      snippet: 'Address not found',
      payload: {
        mimeType: 'multipart/report',
        headers: [
          { name: 'From', value: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>' },
          { name: 'To', value: 'rep@example.com' },
          { name: 'Subject', value: 'Delivery Status Notification (Failure)' },
          { name: 'Message-ID', value: '<bounce-1@mail.gmail.com>' },
        ],
        parts: [
          { mimeType: 'text/plain', body: { data: b64url('Your message was not delivered to gone@acme.com because the address could not be found.') } },
          { mimeType: 'message/delivery-status', body: { data: b64url('Reporting-MTA: dns; googlemail.com\r\n\r\nFinal-Recipient: rfc822; gone@acme.com\r\nAction: failed\r\nStatus: 5.1.1\r\nDiagnostic-Code: smtp; 550-5.1.1 The email account does not exist\r\n') } },
          { mimeType: 'message/rfc822', parts: [{ mimeType: 'text/plain', headers: [{ name: 'Message-ID', value: `<${ours}>` }, { name: 'To', value: 'gone@acme.com' }], body: { data: b64url('original body') } }] },
        ],
      },
    };
    const messages: Record<string, unknown> = {
      m_thread: message('m_thread', 'thr_ours', { From: 'Lead <lead@acme.com>', To: 'rep@example.com', Subject: 'Re: Quick question' }),
      m_ref: message('m_ref', 'thr_new', { From: 'other@acme.com', To: 'rep@example.com', Subject: 'Re: Quick question', 'In-Reply-To': `<${ours}>` }),
      m_private: message('m_private', 'thr_private', { From: 'friend@gmail.com', To: 'rep@example.com', Subject: 'Dinner?' }),
      m_ooo: message('m_ooo', 'thr_ours', { From: 'lead@acme.com', To: 'rep@example.com', Subject: 'Automatic reply: Quick question', 'Auto-Submitted': 'auto-replied' }, { snippet: 'I am out of the office until October 20 and will reply on my return.' }),
      m_self: message('m_self', 'thr_ours', { From: 'rep@example.com', To: 'lead@acme.com', Subject: 'Re: Quick question' }),
      m_bounce: bounce,
    };
    const fetched: string[] = [];
    server.use(
      http.get(`${API}/history`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('startHistoryId')).toBe('5000');
        expect(url.searchParams.get('historyTypes')).toBe('messageAdded');
        expect(url.searchParams.get('labelId')).toBe('INBOX');
        if (!url.searchParams.get('pageToken')) {
          return HttpResponse.json({ historyId: '5010', nextPageToken: 'p2', history: [{ id: '5001', messagesAdded: [{ message: { id: 'm_thread', threadId: 'thr_ours' } }, { message: { id: 'm_ref', threadId: 'thr_new' } }, { message: { id: 'm_private', threadId: 'thr_private' } }] }] });
        }
        return HttpResponse.json({ historyId: '5020', history: [{ id: '5011', messagesAdded: [{ message: { id: 'm_ooo', threadId: 'thr_ours' } }, { message: { id: 'm_self', threadId: 'thr_ours' } }, { message: { id: 'm_bounce', threadId: 'thr_other' } }] }] });
      }),
      http.get(`${API}/messages/:id`, ({ params, request }) => {
        fetched.push(`${params.id as string}:${new URL(request.url).searchParams.get('format')}`);
        const m = messages[params.id as string];
        return m ? HttpResponse.json(m) : HttpResponse.json({ error: { code: 404, message: 'Not Found' } }, { status: 404 });
      }),
    );

    const { events, cursor } = await provider().poll({ channel, cursor: '5000', threadRefs: ['thr_ours'], messageIds: [`<${ours}>`] });
    expect(cursor).toBe('5020');
    expect(events.map((e) => e.externalId)).toEqual(['m_thread', 'm_ref', 'm_ooo', 'm_bounce']);

    expect(events[0]).toMatchObject({ kind: 'reply', channel: 'email', from: 'lead@acme.com', to: 'rep@example.com', threadRef: 'thr_ours', subject: 'Re: Quick question', occurredAt: new Date(1760349600000) });
    expect(events[0]).not.toHaveProperty('autoReply');
    expect((events[0] as { body?: string }).body).toBeUndefined();
    expect(events[1]).toMatchObject({ kind: 'reply', inReplyTo: ours, threadRef: 'thr_new' });
    expect(events[2]).toMatchObject({ kind: 'reply', autoReply: { until: new Date('2026-10-20T00:00:00.000Z') } });
    expect(events[3]).toEqual({ kind: 'bounce', channel: 'email', externalId: 'm_bounce', occurredAt: new Date(1760349600000), address: 'gone@acme.com', hard: true, originalMessageId: ours, reason: '550-5.1.1 The email account does not exist' });

    // Bodies stay out unless asked: only the bounce was read in full.
    expect(fetched.filter((f) => f.endsWith(':full'))).toEqual(['m_bounce:full']);
  });

  it('drops a bounce that does not quote one of our messages', async () => {
    server.use(
      http.get(`${API}/history`, () => HttpResponse.json({ historyId: '5001', history: [{ id: '5001', messagesAdded: [{ message: { id: 'm_b', threadId: 'thr_x' } }] }] })),
      http.get(`${API}/messages/:id`, () =>
        HttpResponse.json({ id: 'm_b', threadId: 'thr_x', internalDate: '1', payload: { mimeType: 'multipart/report', headers: [{ name: 'From', value: 'mailer-daemon@googlemail.com' }, { name: 'Message-ID', value: '<b@x>' }], parts: [{ mimeType: 'message/delivery-status', body: { data: b64url('Status: 5.1.1\r\nFinal-Recipient: rfc822; someone@else.com\r\n') } }, { mimeType: 'text/plain', body: { data: b64url('Message-ID: <not-ours@elsewhere>') } }] } }),
      ),
    );
    expect(await provider().poll({ channel, cursor: '5000', threadRefs: ['thr_ours'], messageIds: ['ours@opensequence'] })).toEqual({ events: [], cursor: '5001' });
  });

  it('resets the cursor when the history id is too old', async () => {
    server.use(http.get(`${API}/history`, () => HttpResponse.json({ error: { code: 404, message: 'Requested entity was not found.' } }, { status: 404 })));
    expect(await provider().poll({ channel, cursor: '1', threadRefs: [], messageIds: [] })).toEqual({ events: [], cursor: null });
  });

  it('reads the body only when includeBodies is on', async () => {
    server.use(
      http.get(`${API}/history`, () => HttpResponse.json({ historyId: '5001', history: [{ id: '5001', messagesAdded: [{ message: { id: 'm_t', threadId: 'thr_ours' } }] }] })),
      http.get(`${API}/messages/:id`, ({ request }) => {
        const format = new URL(request.url).searchParams.get('format');
        const headers = [{ name: 'From', value: 'lead@acme.com' }, { name: 'To', value: 'rep@example.com' }, { name: 'Subject', value: 'Re: hi' }];
        if (format === 'metadata') return HttpResponse.json({ id: 'm_t', threadId: 'thr_ours', internalDate: '1', payload: { mimeType: 'multipart/alternative', headers } });
        return HttpResponse.json({ id: 'm_t', threadId: 'thr_ours', internalDate: '1', payload: { mimeType: 'multipart/alternative', headers, parts: [{ mimeType: 'text/plain', body: { data: b64url('Yes, let us talk.') } }, { mimeType: 'text/html', body: { data: b64url('<p>Yes</p>') } }] } });
      }),
    );
    const withBodies = new GmailEmailProvider(tokens, { includeBodies: true });
    const { events } = await withBodies.poll({ channel, cursor: '5000', threadRefs: ['thr_ours'], messageIds: [] });
    expect(events[0]).toMatchObject({ kind: 'reply', body: 'Yes, let us talk.' });
  });
});

describe('health', () => {
  it('maps profile responses to channel statuses', async () => {
    server.use(http.get(`${API}/profile`, () => HttpResponse.json({ emailAddress: 'rep@example.com', historyId: '1' })));
    expect(await provider().health(channel)).toBe('active');
    server.use(http.get(`${API}/profile`, () => HttpResponse.json({ error: { code: 401, message: 'Invalid Credentials' } }, { status: 401 })));
    expect(await provider().health(channel)).toBe('credentials_needed');
    server.use(http.get(`${API}/profile`, () => HttpResponse.json({ error: { code: 403, message: 'Request had insufficient authentication scopes.' } }, { status: 403 })));
    expect(await provider().health(channel)).toBe('restricted');
    expect(await provider().health({ ...channel, connectionId: undefined })).toBe('credentials_needed');
  });
});

describe('verifyWebhook', () => {
  it('accepts a Pub/Sub push and yields no events', async () => {
    const data = Buffer.from(JSON.stringify({ emailAddress: 'rep@example.com', historyId: 123 })).toString('base64');
    const rawBody = Buffer.from(JSON.stringify({ message: { data, messageId: '1' }, subscription: 'projects/x/subscriptions/y' }));
    expect(await provider().verifyWebhook({ projectId: 'prj_1', headers: {}, rawBody, secret: '' })).toEqual([]);
    await expect(provider().verifyWebhook({ projectId: 'prj_1', headers: {}, rawBody: Buffer.from('nope'), secret: '' })).rejects.toThrow(/Pub\/Sub/);
  });
});
