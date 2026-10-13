/** Analytics (read-only): the only two outcomes are replies and meetings booked (docs section 10.8). */
import type { HttpClient } from '../client.js';
import type { AnalyticsQuery, ChannelReport, NodeReport, SequenceExits, SequenceRow, SequenceSummary } from '../types.js';

export type AllSequencesQuery = AnalyticsQuery & { min_enrolled?: number };

const enc = encodeURIComponent;

export class Analytics {
  constructor(private readonly http: HttpClient) {}

  /** Enrolled, active, exited, replies and meetings with rates per 100 enrolled and per 100 delivered touches. */
  summary(sequenceId: string, query: AnalyticsQuery = {}): Promise<SequenceSummary> {
    return this.http.request({ method: 'GET', path: `/v1/sequences/${enc(sequenceId)}/analytics/summary`, query });
  }

  /** Exit reasons, most frequent first. */
  exits(sequenceId: string, query: AnalyticsQuery = {}): Promise<SequenceExits> {
    return this.http.request({ method: 'GET', path: `/v1/sequences/${enc(sequenceId)}/analytics/exits`, query });
  }

  /** Per step: reached, executed, skipped by reason, delivered, bounced, replies, meetings, median time to reply. */
  nodes(sequenceId: string, query: AnalyticsQuery = {}): Promise<{ sequence: string; nodes: NodeReport[] }> {
    return this.http.request({ method: 'GET', path: `/v1/sequences/${enc(sequenceId)}/analytics/nodes`, query });
  }

  /** Per channel, split by touch number. */
  channels(sequenceId: string, query: AnalyticsQuery = {}): Promise<{ sequence: string; channels: ChannelReport[] }> {
    return this.http.request({ method: 'GET', path: `/v1/sequences/${enc(sequenceId)}/analytics/channels`, query });
  }

  /** Every sequence ranked by replies then meetings per 100 enrolled; `min_enrolled` hides tiny samples. */
  sequences(query: AllSequencesQuery = {}): Promise<{ sequences: SequenceRow[] }> {
    return this.http.request({ method: 'GET', path: '/v1/analytics/sequences', query });
  }
}
