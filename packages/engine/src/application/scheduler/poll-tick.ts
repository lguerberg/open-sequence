/**
 * The poll job (docs section 3.1): for every active email channel with a connection, read the
 * mailbox over IMAP from its stored cursor (scoped to the threads we started in the last 30 days),
 * hand the events to the signal pipeline, and every 15 minutes ask the provider whether the
 * connection is still healthy. Cursors are written only after the events
 * were ingested, so a failure re-reads them; signals are unique per external id, so that is safe.
 */
import type { ChannelRef } from '@opensequence/core';
import type { SenderChannel } from '../../domain/entities.js';
import type { Deps } from '../deps.js';
import { effectiveSettings } from '../projects/shared.js';
import { setChannelStatus } from '../senders/set-channel-status.js';
import { EMAIL_PROVIDER } from '../senders/shared.js';
import { ingestInboundEvents } from '../signals/ingest-inbound-events.js';
import { DAY_MS, MINUTE_MS } from './shared.js';

const HEALTH_EVERY_MS = 15 * MINUTE_MS;
const THREAD_WINDOW_MS = 30 * DAY_MS;
/** The IMAP position (UID validity and last UID) the next read starts from. */
const CURSOR_KEY = 'imap_cursor';

export interface PollSummary {
  channels: number;
  events: number;
  errors: number;
}

export async function pollTick(deps: Deps): Promise<PollSummary> {
  const now = deps.clock.now();
  const channels = (await deps.uow.repos.senders.listChannels('email', 'active', 500)).filter((c) => c.connectionId);
  const summary: PollSummary = { channels: channels.length, events: 0, errors: 0 };
  for (const channel of channels) {
    try {
      summary.events += await pollChannel(deps, channel, now);
    } catch (err) {
      summary.errors++;
      deps.log.error({ projectId: channel.projectId, senderId: channel.senderId, channelId: channel.id, err }, `poll failed for channel ${channel.id}`);
    }
  }
  return summary;
}

/** One channel: its mailbox and the periodic health check. Exported for tests. */
export async function pollChannel(deps: Deps, channel: SenderChannel, now: Date): Promise<number> {
  const repos = deps.uow.repos;
  const connectionId = channel.connectionId!;
  const ref: ChannelRef = { projectId: channel.projectId, senderId: channel.senderId, channelId: channel.id, connectionId, address: channel.address, config: channel.config };
  let config = { ...channel.config };
  let events = 0;

  if (deps.providers.email.poll) {
    const { threadRefs, messageIds } = await repos.messages.outboundThreadRefs(channel.senderId, 'email', new Date(now.getTime() - THREAD_WINDOW_MS));
    // Bodies are read only for projects that keep them; the ingest stores them under the same setting.
    const project = await repos.projects.byId(channel.projectId);
    const includeBodies = project ? effectiveSettings(project).store_inbound_bodies : false;
    const mail = await deps.providers.email.poll({ channel: ref, cursor: cursorOf(config, CURSOR_KEY), threadRefs, messageIds, includeBodies });
    if (mail.events.length) await ingestInboundEvents(deps, channel.projectId, EMAIL_PROVIDER, mail.events);
    config = { ...config, [CURSOR_KEY]: mail.cursor };
    await repos.senders.updateChannel(channel.id, { config });
    events += mail.events.length;
  }

  const lastHealth = typeof config['last_health_at'] === 'string' ? Date.parse(config['last_health_at']) : 0;
  if (now.getTime() - lastHealth >= HEALTH_EVERY_MS) {
    const status = await deps.providers.email.health(ref);
    await repos.senders.updateChannel(channel.id, { config: { ...config, last_health_at: now.toISOString() } });
    await setChannelStatus(deps, channel.id, status);
  }
  return events;
}

function cursorOf(config: Record<string, unknown>, key: string): string | null {
  const v = config[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}
