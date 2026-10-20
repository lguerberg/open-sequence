import { registry } from '@opensequence/core';
import type { SenderChannel } from '../../domain/entities.js';
import { invalid, notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { CHANNEL_DEFAULTS } from './shared.js';

export interface SetChannelInput {
  channel: string;
  address: string;
  connectionId?: string | null;
  status?: string;
  dailyLimit?: number | null;
  config?: Record<string, unknown>;
}

/** Create or replace a sender's channel: email once its SMTP and IMAP settings are saved, sms from the API. */
export async function setChannel(deps: Deps, projectId: string, senderId: string, input: SetChannelInput): Promise<SenderChannel> {
  if (!registry.channel(input.channel)) throw invalid('UNKNOWN_CHANNEL', `"${input.channel}" is not a channel.`);
  const defaults = CHANNEL_DEFAULTS[input.channel] ?? { dailyLimit: null, minGapSeconds: 0 };
  return deps.uow.transaction(async ({ repos }) => {
    const sender = await repos.senders.byId(projectId, senderId);
    if (!sender) throw notFound('Sender', senderId);
    const existing = await repos.senders.channel(senderId, input.channel);
    return repos.senders.upsertChannel({
      id: existing?.id ?? deps.ids.next('channel'),
      senderId,
      projectId,
      connectionId: input.connectionId ?? existing?.connectionId ?? null,
      channel: input.channel,
      address: input.address,
      status: input.status ?? 'active',
      dailyLimit: input.dailyLimit ?? existing?.dailyLimit ?? defaults.dailyLimit,
      weeklyLimit: existing?.weeklyLimit ?? null,
      minGapSeconds: existing?.minGapSeconds ?? defaults.minGapSeconds,
      optedInAt: existing?.optedInAt ?? null,
      config: { ...(existing?.config ?? {}), ...(input.config ?? {}) },
    });
  });
}
