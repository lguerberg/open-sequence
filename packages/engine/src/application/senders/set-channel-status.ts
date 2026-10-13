import type { Deps } from '../deps.js';

/** Called by health checks and the auth module (credentials_needed, restricted, active). Raises sender.channel_status on a change. */
export async function setChannelStatus(deps: Deps, channelId: string, status: string): Promise<void> {
  await deps.uow.transaction(async ({ repos, raise }) => {
    const ch = await repos.senders.channelById(channelId);
    if (!ch || ch.status === status) return;
    await repos.senders.updateChannel(channelId, { status });
    raise({ type: 'sender.channel_status', projectId: ch.projectId, payload: { sender: ch.senderId, channel: ch.channel, status } });
  });
}
