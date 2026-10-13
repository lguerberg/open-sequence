import type { SenderChannel } from '../../domain/entities.js';
import { invalid, notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { zodProblems } from '../projects/shared.js';
import { channelPatchSchema, type ChannelPatch } from './shared.js';

export async function patchChannel(deps: Deps, projectId: string, senderId: string, channel: string, patch: ChannelPatch): Promise<SenderChannel> {
  const parsed = channelPatchSchema.safeParse(patch);
  if (!parsed.success) throw invalid('INVALID_CHANNEL', zodProblems(parsed.error));
  const d = parsed.data;
  return deps.uow.transaction(async ({ repos }) => {
    const existing = await repos.senders.channel(senderId, channel);
    if (!existing || existing.projectId !== projectId) throw notFound('Channel', channel);
    const update: Parameters<typeof repos.senders.updateChannel>[1] = {};
    if (d.daily_limit !== undefined) update.dailyLimit = d.daily_limit;
    if (d.weekly_limit !== undefined) update.weeklyLimit = d.weekly_limit;
    if (d.min_gap_seconds !== undefined) update.minGapSeconds = d.min_gap_seconds;
    if (d.opted_in !== undefined) update.optedInAt = d.opted_in ? deps.clock.now() : null;
    if (d.status !== undefined) update.status = d.status;
    return repos.senders.updateChannel(existing.id, update);
  });
}
