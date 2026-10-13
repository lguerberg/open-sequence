import type { Deps } from '../deps.js';
import { per100, type AnalyticsQuery } from './shared.js';

export interface SequenceRow {
  sequence: string;
  name: string;
  status: string;
  enrolled: number;
  replies: number;
  meetings: number;
  replies_per_100_enrolled: number | null;
  meetings_per_100_enrolled: number | null;
}

/** Every sequence of the project ranked by replies then meetings per 100 enrolled; `minEnrolled` hides the noise of tiny samples. */
export async function allSequences(deps: Deps, projectId: string, q: AnalyticsQuery & { minEnrolled?: number } = {}): Promise<{ sequences: SequenceRow[] }> {
  const rows = await deps.uow.repos.analytics.sequenceTotals(projectId, { versionId: q.version ?? null, from: q.from ?? null, to: q.to ?? null, senderId: q.sender ?? null, country: q.country?.toUpperCase() ?? null });
  const minEnrolled = q.minEnrolled ?? 0;
  const sequences = rows
    .filter((r) => r.enrolled >= minEnrolled)
    .map((r) => ({
      sequence: r.sequenceId,
      name: r.name,
      status: r.status,
      enrolled: r.enrolled,
      replies: r.replies,
      meetings: r.meetings,
      replies_per_100_enrolled: per100(r.replies, r.enrolled),
      meetings_per_100_enrolled: per100(r.meetings, r.enrolled),
    }))
    .sort((a, b) => (b.replies_per_100_enrolled ?? -1) - (a.replies_per_100_enrolled ?? -1) || (b.meetings_per_100_enrolled ?? -1) - (a.meetings_per_100_enrolled ?? -1) || a.name.localeCompare(b.name));
  return { sequences };
}
