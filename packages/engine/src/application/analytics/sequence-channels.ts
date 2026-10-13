import type { Deps } from '../deps.js';
import { per100, sequenceFilter, type AnalyticsQuery } from './shared.js';

export interface ChannelReport {
  channel: string;
  touch_number: number;
  reached: number;
  sent: number;
  skipped: number;
  delivered: number;
  bounced: number;
  replies: number;
  meetings: number;
  reply_rate_per_100_sent: number | null;
  meeting_rate_per_100_sent: number | null;
}

/**
 * Channel comparison split by touch number (docs section 11.4): email against SMS is only fair at
 * the same position in the sequence, since SMS usually comes later and to warmer contacts.
 */
export async function sequenceChannels(deps: Deps, projectId: string, sequenceId: string, q: AnalyticsQuery = {}): Promise<{ sequence: string; channels: ChannelReport[] }> {
  const repos = deps.uow.repos;
  const f = await sequenceFilter(repos, projectId, sequenceId, q);
  const rows = await repos.analytics.channelStats(f);
  const channels = rows.map((r) => ({
    channel: r.channel,
    touch_number: r.touchNumber,
    reached: r.reached,
    sent: r.sent,
    skipped: r.skipped,
    delivered: r.delivered,
    bounced: r.bounced,
    replies: r.replies,
    meetings: r.meetings,
    reply_rate_per_100_sent: per100(r.replies, r.sent),
    meeting_rate_per_100_sent: per100(r.meetings, r.sent),
  }));
  return { sequence: f.sequenceId, channels };
}
