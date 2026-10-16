/**
 * The SMTP/IMAP adapter against a real mail server: GreenMail in Docker. Skipped unless
 * GREENMAIL_URL points at its API (SMTP and IMAP are on the same host, ports 3025 and 3143 unless
 * GREENMAIL_SMTP_PORT / GREENMAIL_IMAP_PORT say otherwise):
 *
 *   docker run --rm -d --name oseq-greenmail -p 3025:3025 -p 3143:3143 -p 8081:8080 \
 *     -e GREENMAIL_OPTS="-Dgreenmail.setup.test.all -Dgreenmail.hostname=0.0.0.0 -Dgreenmail.verbose" greenmail/standalone:2.1.3
 *   GREENMAIL_URL=http://127.0.0.1:8081 npx vitest run packages/providers/src/smtp
 *   docker rm -f oseq-greenmail
 *
 * Authentication stays on (no greenmail.auth.disabled) so a wrong password is refused.
 * Covers send → APPEND to Sent → findSent, a reply, a DSN bounce and an auto-reply found by poll, health.
 */
import type { ChannelRef } from '@opensequence/core';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ConnectionSecretSource } from '../credentials.js';
import { splitSmtpCredentials, type SmtpCredentials } from './credentials.js';
import { SmtpEmailProvider } from './smtp-email-provider.js';

const api = process.env['GREENMAIL_URL'];
const host = api ? new URL(api).hostname : '127.0.0.1';
const smtpPort = Number(process.env['GREENMAIL_SMTP_PORT'] ?? 3025);
const imapPort = Number(process.env['GREENMAIL_IMAP_PORT'] ?? 3143);

const run = Date.now().toString(36);
const rep = { email: `rep-${run}@example.com`, password: 'rep-secret' };
const lead = { email: `lead-${run}@example.com`, password: 'lead-secret' };

const server = (user: string, password: string, port: number) => ({
  host,
  port,
  secure: false,
  user,
  password,
});
const creds: SmtpCredentials = {
  smtp: server(rep.email, rep.password, smtpPort),
  imap: server(rep.email, rep.password, imapPort),
};

/** What the auth module would return for the connection: the config half and the secret half. */
const secrets: ConnectionSecretSource = {
  async connectionSecrets(connectionId) {
    const { config, secrets } = splitSmtpCredentials(
      connectionId === 'con_bad' ? { ...creds, imap: { ...creds.imap, password: 'wrong' } } : creds
    );
    return { account: rep.email, config, secrets };
  },
};

const channel: ChannelRef = {
  projectId: 'prj_1',
  senderId: 'snd_1',
  channelId: 'chn_1',
  connectionId: 'con_1',
  address: rep.email,
  config: {},
};
const now = () => new Date('2026-10-13T10:00:00Z');
const messageId = `<seq.enr1.n1.${run}@example.com>`;
const followUpId = `<seq.enr1.n2.${run}@example.com>`;

async function createUser(u: { email: string; password: string }) {
  const res = await fetch(`${api}/api/user`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: u.email, login: u.email, password: u.password }),
  });
  if (!res.ok) throw new Error(`GreenMail refused the user: ${res.status} ${await res.text()}`);
}

/** Sends a raw message into GreenMail as any address (it accepts every sender). */
async function inject(from: string, to: string, raw: string) {
  const transport = nodemailer.createTransport({
    host,
    port: smtpPort,
    secure: false,
    auth: { user: lead.email, pass: lead.password },
  });
  try {
    await transport.sendMail({ envelope: { from, to: [to] }, raw });
  } finally {
    transport.close();
  }
}

async function inbox(
  user: { email: string; password: string },
  mailbox = 'INBOX'
): Promise<Array<{ messageId?: string; headers: string }>> {
  const client = new ImapFlow({
    host,
    port: imapPort,
    secure: false,
    auth: { user: user.email, pass: user.password },
    logger: false,
    disableAutoIdle: true,
  });
  await client.connect();
  try {
    const lock = await client.getMailboxLock(mailbox, { readOnly: true });
    try {
      const out: Array<{ messageId?: string; headers: string }> = [];
      for await (const msg of client.fetch('1:*', { envelope: true, headers: true }))
        out.push({
          messageId: msg.envelope?.messageId,
          headers: msg.headers?.toString('utf8') ?? '',
        });
      return out;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

const crlf = (lines: string[]) => lines.join('\r\n') + '\r\n';

describe.skipIf(!api)('SmtpEmailProvider against GreenMail (GREENMAIL_URL)', () => {
  const provider = new SmtpEmailProvider(secrets, { now, includeBodies: true });
  let cursor: string | null = null;

  beforeAll(async () => {
    await createUser(rep);
    await createUser(lead);
  });

  it('send: the message reaches the recipient with our headers, and a copy lands in Sent', async () => {
    const result = await provider.send({
      channel,
      to: lead.email,
      subject: 'Quick question — café',
      text: 'Hello = world',
      html: '<p>Hello</p>',
      messageId,
      headers: {
        'List-Unsubscribe': '<https://seq.example/u/tok>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    expect(result).toEqual({ providerId: messageId, threadRef: messageId });

    const received = await inbox(lead);
    expect(received.map((m) => m.messageId)).toContain(messageId);
    const headers = received.find((m) => m.messageId === messageId)!.headers;
    expect(headers).toContain(`From: ${rep.email}\r\n`);
    expect(headers).toContain('List-Unsubscribe: <https://seq.example/u/tok>\r\n');
    expect(headers).toContain('Subject: =?UTF-8?B?UXVpY2sgcXVlc3Rpb24g4oCUIGNhZsOp?=\r\n');

    const sent = await inbox(rep, 'Sent');
    expect(sent.map((m) => m.messageId)).toEqual([messageId]);
  });

  it('send: a Message-ID already in Sent is not filed a second time', async () => {
    const id = `<seq.enr9.n1.${run}@example.com>`;
    await provider.send({
      channel,
      to: lead.email,
      subject: 'Once',
      text: 'x',
      messageId: id,
      headers: {},
    });
    await provider.send({
      channel,
      to: lead.email,
      subject: 'Once',
      text: 'x',
      messageId: id,
      headers: {},
    });
    const sent = await inbox(rep, 'Sent');
    expect(sent.filter((m) => m.messageId === id)).toHaveLength(1);
  });

  it('findSent: finds the copy by Message-ID in Sent, and nothing for an id that never went out', async () => {
    expect(await provider.findSent({ channel, messageId })).toEqual({
      providerId: messageId,
      threadRef: messageId,
    });
    expect(
      await provider.findSent({ channel, messageId: `<never.${run}@example.com>` })
    ).toBeNull();
  });

  it('send: a threaded follow-up keeps the thread root as threadRef and its copy names the root in References', async () => {
    const result = await provider.send({
      channel,
      to: lead.email,
      subject: 'Re: Quick question',
      text: 'Bumping this',
      messageId: followUpId,
      inReplyTo: messageId,
      references: [messageId],
      threadRef: messageId,
      headers: {},
    });
    expect(result).toEqual({ providerId: followUpId, threadRef: messageId });
    expect(await provider.findSent({ channel, messageId: followUpId })).toEqual({
      providerId: followUpId,
      threadRef: messageId,
    });
  });

  it('poll: the first call takes the mailbox position and reports nothing', async () => {
    const first = await provider.poll({
      channel,
      cursor: null,
      threadRefs: [messageId],
      messageIds: [messageId, followUpId],
    });
    expect(first.events).toEqual([]);
    expect(first.cursor).toMatch(/^\d+:\d+$/);
    cursor = first.cursor;
  });

  it('poll: a reply from the lead in our thread becomes a reply event, in the engine spelling of the ids', async () => {
    await inject(
      lead.email,
      rep.email,
      crlf([
        `From: Dana <${lead.email}>`,
        `To: ${rep.email}`,
        'Subject: Re: Quick question',
        `Message-ID: <reply.${run}@example.com>`,
        `In-Reply-To: ${followUpId}`,
        `References: ${messageId} ${followUpId}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        '',
        'Sure, Thursday works.',
      ])
    );
    // Noise in the same inbox: must be ignored, never stored.
    await inject(
      'news@vendor.example',
      rep.email,
      crlf([
        'From: news@vendor.example',
        `To: ${rep.email}`,
        'Subject: October update',
        `Message-ID: <news.${run}@vendor.example>`,
        '',
        'Unrelated.',
      ])
    );

    const polled = await provider.poll({
      channel,
      cursor,
      threadRefs: [messageId],
      messageIds: [messageId, followUpId],
    });
    expect(polled.events).toHaveLength(1);
    expect(polled.events[0]).toMatchObject({
      kind: 'reply',
      channel: 'email',
      externalId: `reply.${run}@example.com`,
      from: lead.email,
      to: rep.email,
      subject: 'Re: Quick question',
      inReplyTo: followUpId,
      threadRef: messageId,
      body: 'Sure, Thursday works.',
    });
    expect(polled.cursor).not.toBe(cursor);
    cursor = polled.cursor;

    // Nothing new: same cursor, no events.
    const again = await provider.poll({
      channel,
      cursor,
      threadRefs: [messageId],
      messageIds: [messageId, followUpId],
    });
    expect(again).toEqual({ events: [], cursor });
  });

  it('poll: a DSN from the mailer daemon about our message becomes a hard bounce', async () => {
    await inject(
      `mailer-daemon@mail.example.net`,
      rep.email,
      crlf([
        'From: Mail Delivery Subsystem <mailer-daemon@mail.example.net>',
        `To: ${rep.email}`,
        'Subject: Undelivered Mail Returned to Sender',
        `Message-ID: <dsn.${run}@mail.example.net>`,
        'MIME-Version: 1.0',
        'Content-Type: multipart/report; report-type=delivery-status; boundary="=_dsn"',
        '',
        '--=_dsn',
        'Content-Type: text/plain; charset=us-ascii',
        '',
        'This is the mail system at host mail.example.net. Your message could not be delivered.',
        '',
        '--=_dsn',
        'Content-Type: message/delivery-status',
        '',
        'Reporting-MTA: dns; mail.example.net',
        '',
        'Final-Recipient: rfc822; nobody@acme.com',
        'Action: failed',
        'Status: 5.1.1',
        'Diagnostic-Code: smtp; 550 5.1.1 User unknown',
        '',
        '--=_dsn',
        'Content-Type: message/rfc822',
        '',
        `From: ${rep.email}`,
        'To: nobody@acme.com',
        'Subject: Quick question',
        `Message-ID: ${messageId}`,
        '',
        'Hello',
        '',
        '--=_dsn--',
      ])
    );
    const polled = await provider.poll({
      channel,
      cursor,
      threadRefs: [messageId],
      messageIds: [messageId, followUpId],
    });
    expect(polled.events).toHaveLength(1);
    expect(polled.events[0]).toMatchObject({
      kind: 'bounce',
      channel: 'email',
      externalId: `dsn.${run}@mail.example.net`,
      address: 'nobody@acme.com',
      hard: true,
      originalMessageId: messageId,
      reason: '550 5.1.1 User unknown',
    });
    cursor = polled.cursor;
  });

  it('poll: an out-of-office answer to our message is a reply flagged as auto-reply, with its return date', async () => {
    await inject(
      lead.email,
      rep.email,
      crlf([
        `From: Dana <${lead.email}>`,
        `To: ${rep.email}`,
        'Subject: Automatic reply: Quick question',
        `Message-ID: <ooo.${run}@example.com>`,
        `In-Reply-To: ${messageId}`,
        `References: ${messageId}`,
        'Auto-Submitted: auto-replied',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        '',
        'I am out of the office until October 20, 2026.',
      ])
    );
    const polled = await provider.poll({
      channel,
      cursor,
      threadRefs: [messageId],
      messageIds: [messageId, followUpId],
    });
    expect(polled.events).toHaveLength(1);
    expect(polled.events[0]).toMatchObject({
      kind: 'reply',
      externalId: `ooo.${run}@example.com`,
      inReplyTo: messageId,
      threadRef: messageId,
      autoReply: { until: new Date('2026-10-20T00:00:00Z') },
    });
    cursor = polled.cursor;
  });

  it('health: active with the right password, credentials_needed with a wrong one', async () => {
    expect(await provider.health(channel)).toBe('active');
    expect(await provider.health({ ...channel, connectionId: 'con_bad' })).toBe(
      'credentials_needed'
    );
    expect(await provider.health({ ...channel, connectionId: undefined })).toBe(
      'credentials_needed'
    );
  });

  it('send: a wrong password fails with a credentials_needed error the executor understands', async () => {
    const bad = new SmtpEmailProvider({
      connectionSecrets: async () => ({
        account: rep.email,
        ...splitSmtpCredentials({ ...creds, smtp: { ...creds.smtp, password: 'wrong' } }),
      }),
    });
    await expect(
      bad.send({
        channel,
        to: lead.email,
        subject: 'x',
        text: 'x',
        messageId: `<bad.${run}@example.com>`,
        headers: {},
      })
    ).rejects.toThrow(/credentials_needed/);
  });
});
