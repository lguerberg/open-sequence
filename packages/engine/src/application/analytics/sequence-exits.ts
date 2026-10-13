import type { Deps } from '../deps.js';
import { sequenceFilter, type AnalyticsQuery } from './shared.js';

/** Exits by reason (reply, meeting_booked, bounce, opt_out, manual, …), largest first. */
export async function sequenceExits(deps: Deps, projectId: string, sequenceId: string, q: AnalyticsQuery = {}): Promise<{ sequence: string; exits: Array<{ reason: string; count: number }> }> {
  const repos = deps.uow.repos;
  const f = await sequenceFilter(repos, projectId, sequenceId, q);
  const byReason = await repos.analytics.exitsByReason(f);
  const exits = Object.entries(byReason)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
  return { sequence: f.sequenceId, exits };
}
