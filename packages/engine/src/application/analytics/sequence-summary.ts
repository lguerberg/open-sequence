import type { Deps } from '../deps.js';
import { per100, sequenceFilter, type AnalyticsQuery } from './shared.js';

export interface SequenceSummary {
  sequence: string;
  enrolled: number;
  active: number;
  exited: number;
  completed: number;
  /** Outreach touches whose message was delivered: the second denominator. */
  touches_delivered: number;
  replies: number;
  meetings: number;
  reply_rate_per_100_enrolled: number | null;
  meeting_rate_per_100_enrolled: number | null;
  reply_rate_per_100_delivered: number | null;
  meeting_rate_per_100_delivered: number | null;
  replies_by_channel: Record<string, number>;
}

/** The sequence overview: people enrolled, the two outcomes, and their rates (docs section 11.4). */
export async function sequenceSummary(deps: Deps, projectId: string, sequenceId: string, q: AnalyticsQuery = {}): Promise<SequenceSummary> {
  const repos = deps.uow.repos;
  const f = await sequenceFilter(repos, projectId, sequenceId, q);
  const [counts, delivered, byChannel] = await Promise.all([repos.analytics.enrollmentCounts(f), repos.analytics.deliveredTouches(f), repos.analytics.repliesByChannel(f)]);
  return {
    sequence: f.sequenceId,
    enrolled: counts.enrolled,
    active: counts.active,
    exited: counts.exited,
    completed: counts.completed,
    touches_delivered: delivered,
    replies: counts.replies,
    meetings: counts.meetings,
    reply_rate_per_100_enrolled: per100(counts.replies, counts.enrolled),
    meeting_rate_per_100_enrolled: per100(counts.meetings, counts.enrolled),
    reply_rate_per_100_delivered: per100(counts.replies, delivered),
    meeting_rate_per_100_delivered: per100(counts.meetings, delivered),
    replies_by_channel: byChannel,
  };
}
