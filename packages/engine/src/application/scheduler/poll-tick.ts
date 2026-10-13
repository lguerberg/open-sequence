/**
 * The poll job (docs section 3.1): for every active email channel with a connection, read the
 * mailbox from its stored cursor (scoped to the threads we started in the last 30 days), read the
 * calendar from its cursor, hand the events to the signal pipeline, and every 15 minutes ask the
 * provider whether the connection is still healthy. Cursors are written only after the events
 * were ingested, so a failure re-reads them; signals are unique per external id, so that is safe.
 */
import type { ChannelRef } from '@opensequence/core';
import type { SenderChannel } from '../../domain/entities.js';
import type { Deps } from '../deps.js';
import { setChannelStatus } from '../senders/set-channel-status.js';
import { ingestInboundEvents } from '../signals/ingest-inbound-events.js';
import { DAY_MS, MINUTE_MS } from './shared.js';

const HEALTH_EVERY_MS = 15 * MINUTE_MS;
const THREAD_WINDOW_MS = 30 * DAY_MS;
const PROVIDER = 'google';

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

async function pollChannel(deps: Deps, channel: SenderChannel, now: Date): Promise<number> {
  const repos = deps.uow.repos;
  const connectionId = channel.connectionId!;
  const ref: ChannelRef = { projectId: channel.projectId, senderId: channel.senderId, channelId: channel.id, connectionId, address: channel.address, config: channel.config };
  let config = { ...channel.config };
  let events = 0;

  if (deps.providers.email.poll) {
    const { threadRefs, messageIds } = await repos.messages.outboundThreadRefs(channel.senderId, 'email', new Date(now.getTime() - THREAD_WINDOW_MS));
    const mail = await deps.providers.email.poll({ channel: ref, cursor: cursorOf(config, 'gmail_cursor'), threadRefs, messageIds });
    if (mail.events.length) await ingestInboundEvents(deps, channel.projectId, PROVIDER, mail.events);
    config = { ...config, gmail_cursor: mail.cursor };
    await repos.senders.updateChannel(channel.id, { config });
    events += mail.events.length;
  }

  const calendar = await deps.providers.calendar.poll({ connectionId, projectId: channel.projectId, cursor: cursorOf(config, 'calendar_cursor') });
  if (calendar.events.length) await ingestInboundEvents(deps, channel.projectId, PROVIDER, calendar.events);
  config = { ...config, calendar_cursor: calendar.cursor };
  await repos.senders.updateChannel(channel.id, { config });
  events += calendar.events.length;

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
