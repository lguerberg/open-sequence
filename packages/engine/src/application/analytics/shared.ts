/**
 * What the analytics use cases share: the query a client sends, how it becomes a read-model filter
 * scoped to one sequence of one project, and the rate arithmetic (per 100, never NaN).
 */
import type { AnalyticsFilter, Repositories } from '../../domain/repositories.js';
import { notFound } from '../../domain/shared/errors.js';

export interface AnalyticsQuery {
  version?: string | null;
  from?: Date | null;
  to?: Date | null;
  sender?: string | null;
  country?: string | null;
}

/** The filter for one sequence, after checking it belongs to the project. */
export async function sequenceFilter(repos: Repositories, projectId: string, sequenceId: string, q: AnalyticsQuery): Promise<AnalyticsFilter> {
  const sequence = await repos.sequences.byId(projectId, sequenceId);
  if (!sequence) throw notFound('Sequence', sequenceId);
  return { projectId, sequenceId: sequence.id, versionId: q.version ?? null, from: q.from ?? null, to: q.to ?? null, senderId: q.sender ?? null, country: q.country?.toUpperCase() ?? null };
}

/** n per 100 of d, rounded to one decimal; null when there is no denominator. */
export function per100(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : null;
}
