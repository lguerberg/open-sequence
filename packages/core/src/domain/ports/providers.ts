/**
 * Provider ports. The engine never calls a vendor; it calls these. Adapters live in
 * @opensequence/providers and get credentials only through @opensequence/auth.
 */
import type { InlineImage } from '../email/inline-images.js';

/** What an adapter needs to act for one sender on one channel. Secrets arrive through the auth module, not here. */
export interface ChannelRef {
  projectId: string;
  senderId: string;
  channelId: string;
  /** The mailbox connection id for email channels; absent for API-key channels. */
  connectionId?: string;
  /** Mailbox address or E.164 number. */
  address: string;
  /** Non-secret per-channel settings (allo user id, history cursor, …). */
  config: Record<string, unknown>;
}

export type InboundEvent =
  | { kind: 'reply'; channel: 'email' | 'sms'; externalId: string; occurredAt: Date; from: string; to: string; threadRef?: string; subject?: string; body?: string; inReplyTo?: string; autoReply?: { until?: Date } }
  | { kind: 'bounce'; channel: 'email'; externalId: string; occurredAt: Date; address: string; hard: boolean; originalMessageId?: string; reason?: string }
  | { kind: 'complaint'; channel: 'email'; externalId: string; occurredAt: Date; address: string }
  | { kind: 'opt_out'; channel: 'sms' | 'email'; externalId: string; occurredAt: Date; from: string; to?: string }
  | { kind: 'sent'; channel: 'sms' | 'email'; externalId: string; occurredAt: Date; from: string; to: string; body?: string }
  | { kind: 'call_completed'; externalId: string; occurredAt: Date; from: string; to: string; direction: 'inbound' | 'outbound'; result: string; userEmail?: string; summary?: string; durationMinutes?: number }
  | { kind: 'meeting_booked'; externalId: string; occurredAt: Date; attendee: string; startsAt: Date }
  | { kind: 'channel_status'; externalId: string; occurredAt: Date; status: 'active' | 'credentials_needed' | 'restricted' };

export interface EmailSendRequest {
  channel: ChannelRef;
  to: string;
  subject: string;
  text: string;
  /** The HTML body; embedded images are already `cid:` references to `inlineImages`. */
  html?: string;
  /** Images the HTML references by `cid:`, sent as inline parts in a multipart/related next to the HTML. */
  inlineImages?: InlineImage[];
  /** Our own Message-ID, derived from the run key; also the idempotency key. */
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  /** The provider thread of the message being replied to, when known; saves a lookup on providers that thread by id. */
  threadRef?: string;
  headers: Record<string, string>;
}

export interface EmailProvider {
  send(req: EmailSendRequest): Promise<{ providerId: string; threadRef: string }>;
  /** Crash recovery: did a message with this Message-ID already go out? */
  findSent(req: { channel: ChannelRef; messageId: string }): Promise<{ providerId: string; threadRef: string } | null>;
  /** Push adapters verify and normalize a webhook. */
  verifyWebhook?(req: { projectId: string; headers: Record<string, string | string[] | undefined>; rawBody: Buffer; secret: string }): Promise<InboundEvent[]>;
  /** Pull adapters are polled with a cursor; `threadRefs` scopes the read to threads we started. */
  poll?(req: { channel: ChannelRef; cursor: string | null; threadRefs: string[]; messageIds: string[] }): Promise<{ events: InboundEvent[]; cursor: string | null }>;
  health(channel: ChannelRef): Promise<'active' | 'credentials_needed' | 'restricted'>;
}

export interface SmsProvider {
  send(req: { channel: ChannelRef; to: string; body: string; idempotencyKey: string }): Promise<{ providerId: string | null }>;
  /** Did this text already go out? (Allo has no idempotency key, so this searches recent outbound messages.) */
  findSent(req: { channel: ChannelRef; to: string; body: string; since: Date }): Promise<{ providerId: string } | null>;
  verifyWebhook(req: { projectId: string; headers: Record<string, string | string[] | undefined>; rawBody: Buffer; secret: string }): Promise<InboundEvent[]>;
  listNumbers(projectId: string): Promise<Array<{ address: string; ref: string; country: string; capabilities: string[]; users: Array<{ id: string; email: string; name: string }> }>>;
  listUsers(projectId: string): Promise<Array<{ id: string; email: string; name: string }>>;
  health(channel: ChannelRef): Promise<'active' | 'credentials_needed' | 'restricted'>;
}

export interface DialerProvider {
  pushNumbers(req: { channel: ChannelRef; numbers: Array<{ number: string; name?: string; lastName?: string; company?: string; emails?: string[]; jobTitle?: string }>; idempotencyKey: string }): Promise<{ added: number; skipped: Array<{ number: string; reason: string }> }>;
  /** Queue state for a sender, used to complete call tasks when the webhook was missed. */
  queueState?(req: { channel: ChannelRef }): Promise<Array<{ number: string; callId: string | null; status: string; reason?: string }>>;
}

export interface CrmSchema {
  objects: Array<{ name: 'person' | 'company' | 'deal'; attributes: Array<{ slug: string; label: string; type: string; values?: string[] }> }>;
}

export type DealSelection = 'newest_open' | 'highest_value' | 'any_open';

export interface CrmProvider {
  schema(projectId: string): Promise<CrmSchema>;
  lookup(req: { projectId: string; email: string | null; domain: string | null; dealSelection: DealSelection }): Promise<{
    person: Record<string, unknown> | null;
    company: Record<string, unknown> | null;
    deal: Record<string, unknown> | null;
    openDeals: number;
  }>;
}

export interface ProviderSet {
  email: EmailProvider;
  sms: SmsProvider;
  dialer: DialerProvider;
  crm: CrmProvider;
}
