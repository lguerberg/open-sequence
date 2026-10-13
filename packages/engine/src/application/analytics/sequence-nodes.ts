import type { Deps } from '../deps.js';
import { per100, sequenceFilter, type AnalyticsQuery } from './shared.js';

export interface NodeReport {
  node_id: string;
  node_type: string;
  channel: string | null;
  reached: number;
  executed: number;
  skipped: number;
  skipped_by_reason: Record<string, number>;
  failed: number;
  delivered: number;
  bounced: number;
  replies: number;
  meetings: number;
  reply_rate_per_100_delivered: number | null;
  median_time_to_reply_seconds: number | null;
}

/** Per step (docs section 11.3): what reached it, what it did, and what came back. */
export async function sequenceNodes(deps: Deps, projectId: string, sequenceId: string, q: AnalyticsQuery = {}): Promise<{ sequence: string; nodes: NodeReport[] }> {
  const repos = deps.uow.repos;
  const f = await sequenceFilter(repos, projectId, sequenceId, q);
  const [stats, skips] = await Promise.all([repos.analytics.nodeStats(f), repos.analytics.skipsByReason(f)]);
  const skipsByNode = new Map<string, Record<string, number>>();
  for (const s of skips) {
    const reasons = skipsByNode.get(s.nodeId) ?? {};
    reasons[s.reason] = (reasons[s.reason] ?? 0) + s.count;
    skipsByNode.set(s.nodeId, reasons);
  }
  const nodes = stats.map((n) => ({
    node_id: n.nodeId,
    node_type: n.nodeType,
    channel: n.channel,
    reached: n.reached,
    executed: n.executed,
    skipped: n.skipped,
    skipped_by_reason: skipsByNode.get(n.nodeId) ?? {},
    failed: n.failed,
    delivered: n.delivered,
    bounced: n.bounced,
    replies: n.replies,
    meetings: n.meetings,
    reply_rate_per_100_delivered: per100(n.replies, n.delivered),
    median_time_to_reply_seconds: n.medianTimeToReplySeconds,
  }));
  return { sequence: f.sequenceId, nodes };
}
