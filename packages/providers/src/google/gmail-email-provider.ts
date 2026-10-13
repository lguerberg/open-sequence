import type { ChannelRef, EmailProvider, EmailSendRequest, InboundEvent } from '@opensequence/core';
import { discard, expectJson, GoogleApiError, googleRequest, readError, withQuery, type GoogleHttp } from './http.js';
import { buildRawMessage } from './mime.js';
import { GMAIL_BASE_URL, type GoogleProviderOptions } from './options.js';
import type { TokenSource } from './token-source.js';
import {
  bareAddress,
  hasDeliveryStatusPart,
  header,
  isAutoReply,
  isBounceSender,
  messageIdsIn,
  METADATA_HEADERS,
  normalizeMessageId,
  parseDeliveryStatus,
  parseUntil,
  textBody,
  type GmailMessage,
} from './gmail-message.js';

interface SendResponse {
  id: string;
  threadId: string;
}

interface ListResponse {
  messages?: Array<{ id: string; threadId: string }>;
}

interface Profile {
  emailAddress: string;
  historyId: string;
}

interface HistoryResponse {
  history?: Array<{ id: string; messagesAdded?: Array<{ message: { id: string; threadId: string; labelIds?: string[] } }> }>;
  nextPageToken?: string;
  historyId: string;
}

/**
 * Gmail over the REST API with plain fetch. Sends from the sender's own mailbox with our
 * Message-ID, finds a sent message again by that id, and reads the inbox through the history
 * feed, keeping only what belongs to threads this service started (section 9.1).
 */
export class GmailEmailProvider implements EmailProvider {
  private readonly http: GoogleHttp;
  private readonly base: string;
  private readonly includeBodies: boolean;
  private readonly now: () => Date;

  constructor(tokens: TokenSource, opts: GoogleProviderOptions = {}) {
    this.http = { tokens, fetch: opts.fetch ?? globalThis.fetch };
    this.base = `${(opts.gmailBaseUrl ?? GMAIL_BASE_URL).replace(/\/$/, '')}/gmail/v1/users/me`;
    this.includeBodies = opts.includeBodies ?? false;
    this.now = opts.now ?? (() => new Date());
  }

  async send(req: EmailSendRequest): Promise<{ providerId: string; threadRef: string }> {
    const connectionId = connectionOf(req.channel);
    const body: { raw: string; threadId?: string } = { raw: buildRawMessage(req, this.now()) };
    // Gmail only threads a reply when the request names the thread. The executor passes the
    // thread of the previous run; without it, find the thread by the id we are answering.
    if (req.threadRef) {
      body.threadId = req.threadRef;
    } else if (req.inReplyTo) {
      const parent = await this.findByMessageId(connectionId, req.inReplyTo);
      if (parent) body.threadId = parent.threadRef;
    }
    const res = await googleRequest(this.http, connectionId, `${this.base}/messages/send`, { method: 'POST', body: JSON.stringify(body) });
    const sent = await expectJson<SendResponse>(res);
    return { providerId: sent.id, threadRef: sent.threadId };
  }

  async findSent(req: { channel: ChannelRef; messageId: string }): Promise<{ providerId: string; threadRef: string } | null> {
    return this.findByMessageId(connectionOf(req.channel), req.messageId);
  }

  private async findByMessageId(connectionId: string, messageId: string): Promise<{ providerId: string; threadRef: string } | null> {
    const url = withQuery(`${this.base}/messages`, { q: `rfc822msgid:${normalizeMessageId(messageId)}`, maxResults: '1' });
    const list = await expectJson<ListResponse>(await googleRequest(this.http, connectionId, url));
    const hit = list.messages?.[0];
    return hit ? { providerId: hit.id, threadRef: hit.threadId } : null;
  }

  async poll(req: { channel: ChannelRef; cursor: string | null; threadRefs: string[]; messageIds: string[] }): Promise<{ events: InboundEvent[]; cursor: string | null }> {
    const connectionId = connectionOf(req.channel);
    if (req.cursor === null) {
      // First poll: take the mailbox's current position and start reading from there.
      const profile = await expectJson<Profile>(await googleRequest(this.http, connectionId, `${this.base}/profile`));
      return { events: [], cursor: profile.historyId };
    }

    const added = new Map<string, string>(); // message id → thread id
    let cursor = req.cursor;
    let pageToken: string | undefined;
    do {
      const url = withQuery(`${this.base}/history`, { startHistoryId: req.cursor, historyTypes: 'messageAdded', labelId: 'INBOX', pageToken });
      const res = await googleRequest(this.http, connectionId, url);
      if (res.status === 404) {
        // The start id has aged out of Gmail's history: the engine re-bootstraps from the profile.
        await discard(res);
        return { events: [], cursor: null };
      }
      const page = await expectJson<HistoryResponse>(res);
      for (const entry of page.history ?? []) {
        for (const { message } of entry.messagesAdded ?? []) added.set(message.id, message.threadId);
      }
      cursor = page.historyId;
      pageToken = page.nextPageToken;
    } while (pageToken);

    const ours = new Set(req.messageIds.map(normalizeMessageId));
    const threads = new Set(req.threadRefs);
    const self = req.channel.address.toLowerCase();
    const events: InboundEvent[] = [];
    for (const [id] of added) {
      const meta = await this.getMessage(connectionId, id, 'metadata');
      if (!meta) continue;
      const event = await this.classify(connectionId, meta, { ours, threads, self });
      if (event) events.push(event);
    }
    return { events, cursor };
  }

  private async classify(connectionId: string, meta: GmailMessage, scope: { ours: Set<string>; threads: Set<string>; self: string }): Promise<InboundEvent | null> {
    const from = bareAddress(header(meta.payload, 'From'));
    if (from === scope.self) return null;
    const inThread = scope.threads.has(meta.threadId);
    const referenced = [...messageIdsIn(header(meta.payload, 'In-Reply-To')), ...messageIdsIn(header(meta.payload, 'References'))];
    const inReplyTo = referenced.find((id) => scope.ours.has(id));
    const occurredAt = meta.internalDate ? new Date(Number(meta.internalDate)) : this.now();

    if (isBounceSender(from)) {
      // A bounce's link to our message sits in its attached original, so it needs the full body.
      const full = await this.getMessage(connectionId, meta.id, 'full');
      if (!full) return null;
      const status = parseDeliveryStatus(full, scope.ours);
      const original = status.originalMessageId ?? inReplyTo;
      if (!inThread && (original === undefined || !scope.ours.has(original))) return null;
      return {
        kind: 'bounce',
        channel: 'email',
        externalId: full.id,
        occurredAt,
        address: status.address ?? '',
        hard: !(status.status ?? '').startsWith('4'),
        originalMessageId: original,
        reason: status.reason,
      };
    }

    if (!inThread && inReplyTo === undefined) return null;

    const subject = header(meta.payload, 'Subject');
    const wantsBody = this.includeBodies;
    const full = wantsBody || hasDeliveryStatusPart(meta) ? await this.getMessage(connectionId, meta.id, 'full') : null;
    if (full && hasDeliveryStatusPart(full)) {
      const status = parseDeliveryStatus(full, scope.ours);
      return {
        kind: 'bounce',
        channel: 'email',
        externalId: full.id,
        occurredAt,
        address: status.address ?? '',
        hard: !(status.status ?? '').startsWith('4'),
        originalMessageId: status.originalMessageId ?? inReplyTo,
        reason: status.reason,
      };
    }

    const event: InboundEvent = {
      kind: 'reply',
      channel: 'email',
      externalId: meta.id,
      occurredAt,
      from,
      to: bareAddress(header(meta.payload, 'To')),
      threadRef: meta.threadId,
      subject,
      inReplyTo: inReplyTo ?? referenced[0],
      body: wantsBody && full ? textBody(full) : undefined,
    };
    if (isAutoReply(meta, subject)) {
      const until = parseUntil(subject, this.now()) ?? parseUntil(meta.snippet, this.now());
      event.autoReply = until ? { until } : {};
    }
    return event;
  }

  private async getMessage(connectionId: string, id: string, format: 'metadata' | 'full'): Promise<GmailMessage | null> {
    const url = withQuery(`${this.base}/messages/${encodeURIComponent(id)}`, {
      format,
      ...(format === 'metadata' ? { metadataHeaders: METADATA_HEADERS.join(',') } : {}),
    });
    const res = await googleRequest(this.http, connectionId, url);
    if (res.status === 404) {
      // Deleted between the history entry and now; nothing to read.
      await discard(res);
      return null;
    }
    return expectJson<GmailMessage>(res);
  }

  async health(channel: ChannelRef): Promise<'active' | 'credentials_needed' | 'restricted'> {
    if (!channel.connectionId) return 'credentials_needed';
    try {
      const res = await googleRequest(this.http, channel.connectionId, `${this.base}/profile`);
      if (res.ok) {
        await discard(res);
        return 'active';
      }
      const { message } = await readError(res);
      throw new GoogleApiError(`Google answered ${res.status}: ${message}`, res.status, false);
    } catch (err) {
      if (err instanceof GoogleApiError) {
        if (err.status === 401) return 'credentials_needed';
        if (err.status === 403 && !err.transient) return 'restricted';
      }
      throw err;
    }
  }

  /**
   * Pub/Sub push from `users.watch`: `{ message: { data: base64({ emailAddress, historyId }) } }`.
   * Push is a nudge, not a source of truth; the poller reads the history and produces the events.
   */
  async verifyWebhook(req: { projectId: string; headers: Record<string, string | string[] | undefined>; rawBody: Buffer; secret: string }): Promise<InboundEvent[]> {
    try {
      const envelope = JSON.parse(req.rawBody.toString('utf8')) as { message?: { data?: string } };
      if (envelope.message?.data) JSON.parse(Buffer.from(envelope.message.data, 'base64').toString('utf8'));
    } catch {
      throw new GoogleApiError('Pub/Sub push body is not a Gmail notification', 400, false);
    }
    return [];
  }
}

function connectionOf(channel: ChannelRef): string {
  if (!channel.connectionId) {
    throw new GoogleApiError(`credentials_needed: channel ${channel.channelId} has no Google connection`, 401, false);
  }
  return channel.connectionId;
}

/** Decodes a Pub/Sub push envelope; exported for the route that turns it into a poll nudge. */
export function decodePushNotification(rawBody: Buffer): { emailAddress: string; historyId: string } | null {
  try {
    const envelope = JSON.parse(rawBody.toString('utf8')) as { message?: { data?: string } };
    if (!envelope.message?.data) return null;
    const data = JSON.parse(Buffer.from(envelope.message.data, 'base64').toString('utf8')) as { emailAddress?: string; historyId?: string | number };
    if (!data.emailAddress || data.historyId === undefined) return null;
    return { emailAddress: data.emailAddress, historyId: String(data.historyId) };
  } catch {
    return null;
  }
}
