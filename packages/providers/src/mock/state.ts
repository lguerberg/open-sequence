import type { ChannelRef, CrmSchema, InboundEvent, InlineImage } from '@opensequence/core';

export interface OutboxEntry {
  projectId: string;
  kind: 'email' | 'sms';
  channel: ChannelRef;
  to: string;
  subject?: string;
  body: string;
  /** Email only: the HTML part, its inline images and the extra headers, as the adapter received them. */
  html?: string;
  inlineImages?: InlineImage[];
  headers?: Record<string, string>;
  /** Email Message-ID or the SMS idempotency key. */
  key: string;
  providerId: string;
  threadRef?: string;
  sentAt: Date;
}

export interface DialerPush {
  projectId: string;
  channel: ChannelRef;
  numbers: Array<{ number: string; name?: string; lastName?: string; company?: string; emails?: string[]; jobTitle?: string }>;
  idempotencyKey: string;
}

export interface MockCrmRecord {
  person?: Record<string, unknown> | null;
  company?: Record<string, unknown> | null;
  deal?: Record<string, unknown> | null;
  openDeals?: number;
}

export interface MockCrmData {
  /** Keyed by the contact's email, lower-cased. */
  byEmail?: Record<string, MockCrmRecord>;
  /** Keyed by the contact's domain, used when no email entry matches. */
  byDomain?: Record<string, MockCrmRecord>;
  schema?: CrmSchema;
}

export interface MockProviderOptions {
  crm?: MockCrmData;
  /** Fixed clock for deterministic tests. */
  now?: () => Date;
}

/**
 * The hooks the server exposes at POST /hooks/mock/{project} and the tests use directly: every
 * mock adapter reads and writes this one object.
 */
export class MockProviders {
  readonly outbox: OutboxEntry[] = [];
  readonly dialerPushes: DialerPush[] = [];
  private readonly inbound = new Map<string, InboundEvent[]>();
  private readonly health = new Map<string, 'active' | 'credentials_needed' | 'restricted'>();
  private readonly callStatus = new Map<string, { callId: string | null; status: string; reason?: string }>();
  readonly now: () => Date;
  readonly crm: MockCrmData;

  constructor(readonly options: MockProviderOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.crm = options.crm ?? {};
  }

  /** Simulates something arriving from the outside: a reply, a bounce, an opt-out, a call. */
  push(projectId: string, event: InboundEvent): void {
    const list = this.inbound.get(projectId) ?? [];
    list.push(event);
    this.inbound.set(projectId, list);
  }

  /** Removes and returns the pending events for a project, optionally only one channel's. */
  drain(projectId: string, filter?: (event: InboundEvent) => boolean): InboundEvent[] {
    return this.take(this.inbound, projectId, filter);
  }

  pending(projectId: string): InboundEvent[] {
    return [...(this.inbound.get(projectId) ?? [])];
  }

  /** `key` is a channel id or a channel address; the first wins when both are set. */
  setHealth(key: string, status: 'active' | 'credentials_needed' | 'restricted'): void {
    this.health.set(key, status);
  }

  healthOf(channel: ChannelRef): 'active' | 'credentials_needed' | 'restricted' {
    return this.health.get(channel.channelId) ?? this.health.get(channel.address) ?? 'active';
  }

  /** Marks a pushed number's call state so `queueState` reports it (QUEUED by default). */
  setCallStatus(number: string, state: { callId: string | null; status: string; reason?: string }): void {
    this.callStatus.set(number, state);
  }

  callStatusOf(number: string): { callId: string | null; status: string; reason?: string } {
    return this.callStatus.get(number) ?? { callId: null, status: 'QUEUED' };
  }

  reset(): void {
    this.outbox.length = 0;
    this.dialerPushes.length = 0;
    this.inbound.clear();
    this.health.clear();
    this.callStatus.clear();
  }

  private take(queue: Map<string, InboundEvent[]>, projectId: string, filter?: (event: InboundEvent) => boolean): InboundEvent[] {
    const list = queue.get(projectId) ?? [];
    if (!filter) {
      queue.delete(projectId);
      return list;
    }
    const taken = list.filter(filter);
    queue.set(
      projectId,
      list.filter((event) => !filter(event)),
    );
    return taken;
  }
}
