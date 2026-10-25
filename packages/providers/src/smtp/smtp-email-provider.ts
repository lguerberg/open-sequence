import type { ChannelRef, EmailProvider, EmailSendRequest, InboundEvent } from '@opensequence/core';
import type { FetchMessageObject, ImapFlow } from 'imapflow';
import type { ConnectionSecretSource } from '../credentials.js';
import { messageIdsIn, normalizeMessageId } from '../email/inbound.js';
import { angleBracketed, buildRfc2822 } from '../email/mime.js';
import {
  smtpCredentialsFor,
  SmtpError,
  type MailServer,
  type SmtpCredentials,
} from './credentials.js';
import {
  classifyInbound,
  headerGetter,
  INBOUND_HEADERS,
  indexIds,
  parseHeaderBlock,
  structureHasDeliveryStatus,
  type InboundMeta,
} from './inbound.js';
import type { SmtpProviderOptions } from './options.js';
import {
  errorText,
  isAuthError,
  isNetworkError,
  probeImap,
  probeSmtp,
  smtpTransport,
  withImap,
} from './probe.js';

/**
 * Any mailbox over SMTP and IMAP (Fastmail, Zoho, a Google Workspace app password, self-hosted
 * mail). Sends through the sender's SMTP server with our Message-ID and appends the copy to the
 * Sent folder, finds a sent message again by that id with a header search, and reads the inbox
 * by UID from the stored cursor, keeping only what answers a message this service sent
 * (section 9.1). SMTP has no thread id, so `threadRef` is the Message-ID of the thread's first
 * message, which is ours. Every call opens its own short-lived connection.
 */
export class SmtpEmailProvider implements EmailProvider {
  /** Set by the constructor option, it wins over each poll's `includeBodies`. */
  private readonly includeBodies: boolean | undefined;
  private readonly now: () => Date;

  constructor(
    private readonly secrets: ConnectionSecretSource,
    private readonly opts: SmtpProviderOptions = {}
  ) {
    this.includeBodies = opts.includeBodies;
    this.now = opts.now ?? (() => new Date());
  }

  async send(req: EmailSendRequest): Promise<{ providerId: string; threadRef: string }> {
    const creds = await smtpCredentialsFor(this.secrets, req.channel);
    const now = this.now();
    const raw = buildRfc2822(req, now);
    const threadRef = angleBracketed(
      req.threadRef ?? req.references?.[0] ?? req.inReplyTo ?? req.messageId
    );

    const transport = smtpTransport(creds.smtp, this.opts);
    try {
      await transport.sendMail({ envelope: { from: req.channel.address, to: [req.to] }, raw });
    } catch (err) {
      throw wrap(err, 'send');
    } finally {
      transport.close();
    }

    // The message has left; the Sent copy is for the rep and for findSent. A failure here must
    // not fail the step, or the retry would send the email a second time.
    try {
      await withImap(creds.imap, this.opts, async (client) => {
        const sent = (await sentMailbox(client)) ?? 'Sent';
        // Some servers (Gmail, a few hosted Exchange setups) file what their SMTP relayed by themselves; never file it twice.
        if (await hasMessageId(client, sent, req.messageId)) return;
        await client.append(sent, raw, ['\\Seen'], now);
      });
    } catch (err) {
      this.opts.warn?.(`could not append the sent copy to the Sent folder: ${errorText(err)}`, {
        channelId: req.channel.channelId,
        messageId: req.messageId,
      });
    }
    return { providerId: req.messageId, threadRef };
  }

  async findSent(req: {
    channel: ChannelRef;
    messageId: string;
  }): Promise<{ providerId: string; threadRef: string } | null> {
    const creds = await smtpCredentialsFor(this.secrets, req.channel);
    const bare = normalizeMessageId(req.messageId);
    try {
      return await withImap(creds.imap, this.opts, async (client) => {
        for (const path of [await sentMailbox(client, { create: false }), 'INBOX']) {
          if (!path) continue;
          const lock = await client.getMailboxLock(path, { readOnly: true });
          try {
            const uids = asList(
              await client.search({ header: { 'message-id': bare } }, { uid: true })
            );
            for (const uid of uids) {
              const msg = await client.fetchOne(
                String(uid),
                { uid: true, headers: ['message-id', 'references'] },
                { uid: true }
              );
              if (!msg) continue;
              const header = headerGetter(parseHeaderBlock(msg.headers));
              // A header search matches substrings; only the exact id counts. The thread root is the first reference, else the message itself.
              if (messageIdsIn(header('message-id'))[0] !== bare) continue;
              const refs = messageIdsIn(header('references'));
              return { providerId: req.messageId, threadRef: angleBracketed(refs[0] ?? bare) };
            }
          } finally {
            lock.release();
          }
        }
        return null;
      });
    } catch (err) {
      throw wrap(err, 'findSent');
    }
  }

  async poll(req: {
    channel: ChannelRef;
    cursor: string | null;
    threadRefs: string[];
    messageIds: string[];
    includeBodies?: boolean;
  }): Promise<{ events: InboundEvent[]; cursor: string | null }> {
    const creds = await smtpCredentialsFor(this.secrets, req.channel);
    const scope = {
      ours: indexIds(req.messageIds),
      threads: indexIds(req.threadRefs),
      self: req.channel.address.toLowerCase(),
      includeBodies: this.includeBodies ?? req.includeBodies ?? false,
      now: this.now,
    };
    try {
      return await withImap(creds.imap, this.opts, async (client) => {
        const lock = await client.getMailboxLock('INBOX', { readOnly: true });
        try {
          const box = client.mailbox;
          if (!box) return { events: [], cursor: req.cursor };
          const validity = box.uidValidity.toString();
          const last = parseCursor(req.cursor);
          if (!last || last.validity !== validity) {
            // First poll, or the mailbox was rebuilt and its UIDs mean something else now: take
            // the current position and start reading from there.
            return { events: [], cursor: cursorString(validity, box.uidNext - 1) };
          }
          const from = last.uid + 1;
          if (box.uidNext <= from) return { events: [], cursor: req.cursor };

          // `n:*` also returns the highest UID when n is past it (RFC 3501), hence the filter.
          const all = asList(await client.search({ uid: `${from}:*` }, { uid: true }))
            .filter((u) => u >= from)
            .sort((a, b) => a - b);
          // A long-idle mailbox is read a batch at a time; the cursor stops at the last UID read.
          const uids = all.slice(0, POLL_BATCH);
          const events: InboundEvent[] = [];
          if (uids.length) {
            const messages = await client.fetchAll(
              uids.join(','),
              {
                uid: true,
                envelope: true,
                internalDate: true,
                bodyStructure: true,
                headers: INBOUND_HEADERS,
              },
              { uid: true }
            );
            for (const msg of messages.sort((a, b) => a.uid - b.uid)) {
              const meta = metaOf(msg, validity);
              const event = await classifyInbound(meta, scope, () =>
                downloadSource(client, msg.uid)
              );
              if (event) events.push(event);
            }
          }
          const readTo =
            all.length > POLL_BATCH
              ? uids.at(-1)!
              : Math.max(last.uid, uids.at(-1) ?? 0, box.uidNext - 1);
          return { events, cursor: cursorString(validity, readTo) };
        } finally {
          lock.release();
        }
      });
    } catch (err) {
      throw wrap(err, 'poll');
    }
  }

  async health(channel: ChannelRef): Promise<'active' | 'credentials_needed' | 'restricted'> {
    let creds: SmtpCredentials;
    try {
      creds = await smtpCredentialsFor(this.secrets, channel);
    } catch (err) {
      if (err instanceof SmtpError || /credentials_needed/i.test(errorText(err)))
        return 'credentials_needed';
      throw err;
    }
    for (const result of [
      await probeImap(creds.imap, this.opts),
      await probeSmtp(creds.smtp, this.opts),
    ]) {
      if (result.ok) continue;
      if (result.code === 'IMAP_AUTH_FAILED' || result.code === 'SMTP_AUTH_FAILED')
        return 'credentials_needed';
      // Unreachable is transient (a blip, a maintenance window): say so and let the next check decide.
      if (result.code === 'IMAP_UNREACHABLE' || result.code === 'SMTP_UNREACHABLE')
        throw new SmtpError(`health: ${result.error}`, result.code);
      return 'restricted';
    }
    return 'active';
  }
}

/** The most messages one poll reads; the rest wait for the next tick. */
const POLL_BATCH = 200;

/** `${uidvalidity}:${uid}`: the last UID read, valid only while the mailbox keeps its UIDVALIDITY. */
function parseCursor(cursor: string | null): { validity: string; uid: number } | null {
  if (!cursor) return null;
  const m = /^(\d+):(\d+)$/.exec(cursor);
  return m ? { validity: m[1]!, uid: Number(m[2]) } : null;
}

function cursorString(validity: string, uid: number): string {
  return `${validity}:${Math.max(0, uid)}`;
}

function asList(result: number[] | false | undefined | { all?: string }): number[] {
  return Array.isArray(result) ? result : [];
}

function metaOf(msg: FetchMessageObject, validity: string): InboundMeta {
  const header = headerGetter(parseHeaderBlock(msg.headers));
  const env = msg.envelope;
  // The headers themselves, not the envelope: some servers leave the envelope's In-Reply-To empty.
  const messageId =
    messageIdsIn(header('message-id') ?? env?.messageId)[0] ??
    (env?.messageId ? normalizeMessageId(env.messageId) : undefined);
  const referenced = [
    ...messageIdsIn(header('in-reply-to') ?? env?.inReplyTo),
    ...messageIdsIn(header('references')),
  ];
  const date =
    env?.date instanceof Date
      ? env.date
      : msg.internalDate instanceof Date
        ? msg.internalDate
        : typeof env?.date === 'string'
          ? new Date(env.date)
          : undefined;
  return {
    externalId: messageId ?? `imap:${validity}:${msg.uid}`,
    from: env?.from?.[0]?.address ?? '',
    to: env?.to?.[0]?.address ?? '',
    subject: env?.subject,
    date: date && !Number.isNaN(date.getTime()) ? date : undefined,
    referenced: [...new Set(referenced)],
    header,
    hasDeliveryStatus: structureHasDeliveryStatus(msg.bodyStructure),
  };
}

/** Is a message with exactly this Message-ID already in the mailbox? */
async function hasMessageId(client: ImapFlow, path: string, messageId: string): Promise<boolean> {
  const bare = normalizeMessageId(messageId);
  const lock = await client.getMailboxLock(path, { readOnly: true });
  try {
    for (const uid of asList(
      await client.search({ header: { 'message-id': bare } }, { uid: true })
    )) {
      const msg = await client.fetchOne(
        String(uid),
        { uid: true, headers: ['message-id'] },
        { uid: true }
      );
      if (
        msg &&
        messageIdsIn(headerGetter(parseHeaderBlock(msg.headers))('message-id'))[0] === bare
      )
        return true;
    }
    return false;
  } finally {
    lock.release();
  }
}

async function downloadSource(client: ImapFlow, uid: number): Promise<Buffer> {
  const { content } = await client.download(String(uid), undefined, { uid: true });
  if (!content) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const chunk of content)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/**
 * The Sent folder: the one flagged `\Sent` (RFC 6154 SPECIAL-USE), else one named Sent (any
 * case, any parent), else a new top-level `Sent` when `create` is on. Returns null when nothing
 * fits and nothing may be created.
 */
export async function sentMailbox(
  client: ImapFlow,
  opts: { create?: boolean } = {}
): Promise<string | null> {
  const boxes = await client.list();
  const special = boxes.find((b) => b.specialUse === '\\Sent' || b.flags.has('\\Sent'));
  if (special) return special.path;
  const named = boxes.find(
    (b) => b.name.toLowerCase() === 'sent' || /^sent (items|mail|messages)$/i.test(b.name)
  );
  if (named) return named.path;
  if (opts.create === false) return null;
  await client.mailboxCreate('Sent');
  return 'Sent';
}

/** A failure the executor can read: `credentials_needed` for a refused login, the server's words otherwise. */
function wrap(err: unknown, action: string): Error {
  if (err instanceof SmtpError) return err;
  const text = errorText(err);
  if (isAuthError(err))
    return new SmtpError(
      `credentials_needed: the mailbox refused the login during ${action}: ${text}`,
      'AUTH_FAILED'
    );
  if (isNetworkError(err))
    return new SmtpError(`${action}: could not reach the mail server: ${text}`, 'UNREACHABLE');
  return new SmtpError(`${action}: the mail server refused: ${text}`, 'REFUSED');
}

export type { MailServer };
