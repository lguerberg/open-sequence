import type { ChannelRef, EmailProvider, EmailSendRequest, InboundEvent } from '@opensequence/core';

/**
 * One EmailProvider in front of several mail adapters: each call goes to the adapter the
 * sender's channel names in `config.provider` (`smtp`), or to the default (Google) when the
 * channel names none, which is every channel made before SMTP existed. The engine keeps calling
 * one `providers.email` and never learns which mailbox type a sender has.
 */
export class ChannelRoutedEmailProvider implements EmailProvider {
  constructor(
    private readonly adapters: Record<string, EmailProvider>,
    private readonly fallback: string
  ) {
    if (!adapters[fallback])
      throw new Error(
        `PROVIDER_MISCONFIGURED: the default email adapter "${fallback}" is not in the list`
      );
  }

  /** The adapter a channel goes through. */
  for(channel: ChannelRef): EmailProvider {
    const named = channel.config['provider'];
    const name = typeof named === 'string' && named.length > 0 ? named : this.fallback;
    const adapter = this.adapters[name];
    if (!adapter)
      throw new Error(
        `PROVIDER_MISCONFIGURED: no email adapter named "${name}" for channel ${channel.channelId}`
      );
    return adapter;
  }

  async send(req: EmailSendRequest): Promise<{ providerId: string; threadRef: string }> {
    return this.for(req.channel).send(req);
  }

  async findSent(req: {
    channel: ChannelRef;
    messageId: string;
  }): Promise<{ providerId: string; threadRef: string } | null> {
    return this.for(req.channel).findSent(req);
  }

  async poll(req: {
    channel: ChannelRef;
    cursor: string | null;
    threadRefs: string[];
    messageIds: string[];
  }): Promise<{ events: InboundEvent[]; cursor: string | null }> {
    const adapter = this.for(req.channel);
    return adapter.poll ? adapter.poll(req) : { events: [], cursor: req.cursor };
  }

  async health(channel: ChannelRef): Promise<'active' | 'credentials_needed' | 'restricted'> {
    return this.for(channel).health(channel);
  }
}
