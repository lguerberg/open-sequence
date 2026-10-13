import type { ChannelRef, EmailProvider, EmailSendRequest, InboundEvent } from '@opensequence/core';
import type { MockProviders } from './state.js';
import { parseInboundEvent } from './events.js';

export class MockEmailProvider implements EmailProvider {
  constructor(private readonly mock: MockProviders) {}

  async send(req: EmailSendRequest): Promise<{ providerId: string; threadRef: string }> {
    const existing = this.mock.outbox.find((entry) => entry.kind === 'email' && entry.key === req.messageId);
    if (existing) return { providerId: existing.providerId, threadRef: existing.threadRef ?? existing.providerId };

    const parent = req.inReplyTo ? this.mock.outbox.find((entry) => entry.kind === 'email' && entry.key === req.inReplyTo) : undefined;
    const providerId = `mock-email:${req.messageId}`;
    const threadRef = parent?.threadRef ?? `mock-thread:${req.messageId}`;
    this.mock.outbox.push({
      projectId: req.channel.projectId,
      kind: 'email',
      channel: req.channel,
      to: req.to,
      subject: req.subject,
      body: req.text,
      key: req.messageId,
      providerId,
      threadRef,
      sentAt: this.mock.now(),
    });
    return { providerId, threadRef };
  }

  async findSent(req: { channel: ChannelRef; messageId: string }): Promise<{ providerId: string; threadRef: string } | null> {
    const entry = this.mock.outbox.find((e) => e.kind === 'email' && e.key === req.messageId && e.projectId === req.channel.projectId);
    return entry ? { providerId: entry.providerId, threadRef: entry.threadRef ?? entry.providerId } : null;
  }

  /** The mock accepts an unsigned JSON InboundEvent (or an array of them) so the dev server's hook is a plain POST. */
  async verifyWebhook(req: { projectId: string; rawBody: Buffer }): Promise<InboundEvent[]> {
    return parseInboundEvent(req.rawBody);
  }

  async poll(req: { channel: ChannelRef; cursor: string | null }): Promise<{ events: InboundEvent[]; cursor: string | null }> {
    const events = this.mock.drain(req.channel.projectId, (event) => 'channel' in event && event.channel === 'email');
    return { events, cursor: String(Number(req.cursor ?? '0') + events.length) };
  }

  async health(channel: ChannelRef): Promise<'active' | 'credentials_needed' | 'restricted'> {
    return this.mock.healthOf(channel);
  }
}
