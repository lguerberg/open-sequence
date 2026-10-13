import type { ChannelRef, DialerProvider } from '@opensequence/core';
import type { MockProviders } from './state.js';

export class MockDialerProvider implements DialerProvider {
  constructor(private readonly mock: MockProviders) {}

  async pushNumbers(req: {
    channel: ChannelRef;
    numbers: Array<{ number: string; name?: string; lastName?: string; company?: string; emails?: string[]; jobTitle?: string }>;
    idempotencyKey: string;
  }): Promise<{ added: number; skipped: Array<{ number: string; reason: string }> }> {
    if (this.mock.dialerPushes.some((push) => push.idempotencyKey === req.idempotencyKey)) {
      return { added: req.numbers.length, skipped: [] };
    }
    this.mock.dialerPushes.push({ projectId: req.channel.projectId, channel: req.channel, numbers: req.numbers, idempotencyKey: req.idempotencyKey });
    return { added: req.numbers.length, skipped: [] };
  }

  async queueState(req: { channel: ChannelRef }): Promise<Array<{ number: string; callId: string | null; status: string; reason?: string }>> {
    return this.mock.dialerPushes
      .filter((push) => push.channel.channelId === req.channel.channelId)
      .flatMap((push) => push.numbers)
      .map((entry) => ({ number: entry.number, ...this.mock.callStatusOf(entry.number) }));
  }
}
