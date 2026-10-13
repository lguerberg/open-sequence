import type { ChannelRef, InboundEvent, SmsProvider } from '@opensequence/core';
import type { MockProviders } from './state.js';
import { parseInboundEvent } from './events.js';

export class MockSmsProvider implements SmsProvider {
  constructor(private readonly mock: MockProviders) {}

  async send(req: { channel: ChannelRef; to: string; body: string; idempotencyKey: string }): Promise<{ providerId: string | null }> {
    const existing = this.mock.outbox.find((entry) => entry.kind === 'sms' && entry.key === req.idempotencyKey);
    if (existing) return { providerId: existing.providerId };
    const providerId = `mock-sms:${req.idempotencyKey}`;
    this.mock.outbox.push({
      projectId: req.channel.projectId,
      kind: 'sms',
      channel: req.channel,
      to: req.to,
      body: req.body,
      key: req.idempotencyKey,
      providerId,
      sentAt: this.mock.now(),
    });
    return { providerId };
  }

  async findSent(req: { channel: ChannelRef; to: string; body: string; since: Date }): Promise<{ providerId: string } | null> {
    const matches = this.mock.outbox
      .filter((e) => e.kind === 'sms' && e.projectId === req.channel.projectId && e.to === req.to && e.body === req.body && e.sentAt >= req.since)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
    return matches[0] ? { providerId: matches[0].providerId } : null;
  }

  async verifyWebhook(req: { projectId: string; rawBody: Buffer }): Promise<InboundEvent[]> {
    return parseInboundEvent(req.rawBody);
  }

  /** The mock SMS adapter is also pollable, so the engine can run it the same way as email. */
  async poll(req: { channel: ChannelRef; cursor: string | null }): Promise<{ events: InboundEvent[]; cursor: string | null }> {
    const events = this.mock.drain(req.channel.projectId, (event) => ('channel' in event && event.channel === 'sms') || event.kind === 'call_completed');
    return { events, cursor: String(Number(req.cursor ?? '0') + events.length) };
  }

  async listNumbers(): Promise<Array<{ address: string; ref: string; country: string; capabilities: string[]; users: Array<{ id: string; email: string; name: string }> }>> {
    return [
      { address: '+15550000001', ref: 'mock-number-1', country: 'US', capabilities: ['VOICE', 'SMS'], users: [{ id: 'usr-mock-1', email: 'rep@example.com', name: 'Mock Rep' }] },
    ];
  }

  async listUsers(): Promise<Array<{ id: string; email: string; name: string }>> {
    return [{ id: 'usr-mock-1', email: 'rep@example.com', name: 'Mock Rep' }];
  }

  async health(channel: ChannelRef): Promise<'active' | 'credentials_needed' | 'restricted'> {
    return this.mock.healthOf(channel);
  }
}
