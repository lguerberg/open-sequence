/**
 * Analytics read model (docs/ARCHITECTURE.md section 11.3): aggregates over the run ledger joined
 * to attributed signals, and over enrollments, read directly with no rollup. Every query is scoped
 * by project and sequence, optionally by version, time window, sender and the contact's country;
 * the country lives on the contact, so runs go through their enrollment to reach it.
 *
 * Filtered counts are `sql` fragments because the builder has no FILTER clause; everything else is
 * the query builder.
 */
import { and, asc, count, eq, gte, isNotNull, lt, sql, type SQL } from 'drizzle-orm';
import type { AnalyticsFilter, AnalyticsReadModel, ChannelStats, EnrollmentCounts, NodeStats, SequenceTotals } from '../../domain/repositories.js';
import type { DbOrTx } from './db.js';
import { contacts, enrollments, runs, sequences, signals } from './schema.js';

/** count(distinct x) filter (where cond); a join to signals must not inflate run counts. */
const countDistinctWhere = (column: SQL | unknown, cond: SQL) => sql<number>`count(distinct ${column}) filter (where ${cond})`.mapWith(Number);
const countWhere = (cond: SQL) => sql<number>`count(*) filter (where ${cond})`.mapWith(Number);

const IS_REPLY = sql`${signals.kind} = 'reply' and ${signals.attribution} <> 'none'`;
const IS_MEETING = sql`${signals.kind} = 'meeting_booked' and ${signals.attribution} <> 'none'`;
const IS_EXECUTED = sql`${runs.status} = 'done' and ${runs.nodeType} = 'outreach'`;
const IS_DELIVERED = sql`${runs.result} #>> '{outcome,delivered_at}' is not null`;
const IS_BOUNCED = sql`${runs.result} #> '{outcome,bounced}' is not null`;

export class DrizzleAnalyticsQueries implements AnalyticsReadModel {
  constructor(private readonly db: DbOrTx) {}

  async enrollmentCounts(f: AnalyticsFilter): Promise<EnrollmentCounts> {
    const [row] = await this.db
      .select({
        enrolled: count(),
        active: countWhere(sql`${enrollments.status} in ('active', 'paused', 'waiting_limit')`),
        exited: countWhere(sql`${enrollments.status} = 'exited'`),
        completed: countWhere(sql`${enrollments.status} = 'completed'`),
        replies: countWhere(sql`${enrollments.repliedAt} is not null`),
        meetings: countWhere(sql`${enrollments.meetingBookedAt} is not null`),
      })
      .from(enrollments)
      .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
      .where(enrollmentScope(f));
    return row ?? { enrolled: 0, active: 0, exited: 0, completed: 0, replies: 0, meetings: 0 };
  }

  async repliesByChannel(f: AnalyticsFilter): Promise<Record<string, number>> {
    const rows = await this.db
      .select({ channel: enrollments.repliedChannel, n: count() })
      .from(enrollments)
      .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
      .where(and(enrollmentScope(f), isNotNull(enrollments.repliedAt)))
      .groupBy(enrollments.repliedChannel);
    return Object.fromEntries(rows.map((r) => [r.channel ?? 'unknown', r.n]));
  }

  async exitsByReason(f: AnalyticsFilter): Promise<Record<string, number>> {
    const rows = await this.db
      .select({ reason: enrollments.exitReason, n: count() })
      .from(enrollments)
      .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
      .where(and(enrollmentScope(f), eq(enrollments.status, 'exited')))
      .groupBy(enrollments.exitReason);
    return Object.fromEntries(rows.map((r) => [r.reason ?? 'unknown', r.n]));
  }

  async deliveredTouches(f: AnalyticsFilter): Promise<number> {
    const [row] = await this.db
      .select({ n: countWhere(sql`${IS_EXECUTED} and ${IS_DELIVERED}`) })
      .from(runs)
      .innerJoin(enrollments, eq(enrollments.id, runs.enrollmentId))
      .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
      .where(runScope(f));
    return row?.n ?? 0;
  }

  /** The per-step query of docs section 11.3, one row per node. */
  async nodeStats(f: AnalyticsFilter): Promise<NodeStats[]> {
    const rows = await this.db
      .select({
        nodeId: runs.nodeId,
        nodeType: runs.nodeType,
        channel: runs.channel,
        reached: sql<number>`count(distinct ${runs.id})`.mapWith(Number),
        executed: countDistinctWhere(runs.id, IS_EXECUTED),
        skipped: countDistinctWhere(runs.id, sql`${runs.status} = 'skipped'`),
        failed: countDistinctWhere(runs.id, sql`${runs.status} = 'failed'`),
        delivered: countDistinctWhere(runs.id, IS_DELIVERED),
        bounced: countDistinctWhere(runs.id, IS_BOUNCED),
        replies: countDistinctWhere(signals.id, IS_REPLY),
        meetings: countDistinctWhere(signals.id, IS_MEETING),
        medianTimeToReplySeconds: medianSecondsToReply(),
      })
      .from(runs)
      .innerJoin(enrollments, eq(enrollments.id, runs.enrollmentId))
      .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
      .leftJoin(signals, eq(signals.attributedRunId, runs.id))
      .where(runScope(f))
      .groupBy(runs.nodeId, runs.nodeType, runs.channel)
      .orderBy(asc(runs.nodeId));
    return rows;
  }

  async skipsByReason(f: AnalyticsFilter): Promise<Array<{ nodeId: string; reason: string; count: number }>> {
    const reason = sql<string | null>`${runs.result} ->> 'skip_reason'`;
    const rows = await this.db
      .select({ nodeId: runs.nodeId, reason, count: count() })
      .from(runs)
      .innerJoin(enrollments, eq(enrollments.id, runs.enrollmentId))
      .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
      .where(and(runScope(f), eq(runs.status, 'skipped')))
      .groupBy(runs.nodeId, reason)
      .orderBy(asc(runs.nodeId));
    return rows.map((r) => ({ nodeId: r.nodeId, reason: r.reason ?? 'unknown', count: r.count }));
  }

  /** Per channel and touch number, outreach runs only; a skipped run has no touch number and lands in bucket 0. */
  async channelStats(f: AnalyticsFilter): Promise<ChannelStats[]> {
    const channel = sql<string>`coalesce(${runs.channel}, '')`;
    const touchNumber = sql<number>`coalesce(${runs.touchNumber}, 0)`.mapWith(Number);
    const rows = await this.db
      .select({
        channel,
        touchNumber,
        reached: sql<number>`count(distinct ${runs.id})`.mapWith(Number),
        sent: countDistinctWhere(runs.id, IS_EXECUTED),
        skipped: countDistinctWhere(runs.id, sql`${runs.status} = 'skipped'`),
        delivered: countDistinctWhere(runs.id, IS_DELIVERED),
        bounced: countDistinctWhere(runs.id, IS_BOUNCED),
        replies: countDistinctWhere(signals.id, IS_REPLY),
        meetings: countDistinctWhere(signals.id, IS_MEETING),
      })
      .from(runs)
      .innerJoin(enrollments, eq(enrollments.id, runs.enrollmentId))
      .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
      .leftJoin(signals, eq(signals.attributedRunId, runs.id))
      .where(and(runScope(f), eq(runs.nodeType, 'outreach')))
      .groupBy(channel, touchNumber)
      .orderBy(channel, touchNumber);
    return rows;
  }

  /** Every sequence of the project, with the enrollments that match the filter counted (zero when none do). */
  async sequenceTotals(projectId: string, f: Omit<AnalyticsFilter, 'projectId' | 'sequenceId'>): Promise<SequenceTotals[]> {
    const match = and(
      f.versionId ? eq(enrollments.versionId, f.versionId) : undefined,
      f.from ? gte(enrollments.enrolledAt, f.from) : undefined,
      f.to ? lt(enrollments.enrolledAt, f.to) : undefined,
      f.senderId ? eq(enrollments.senderId, f.senderId) : undefined,
      f.country ? eq(contacts.country, f.country) : undefined
    );
    const matches = (cond: SQL) => (match ? sql`${match} and ${cond}` : cond);
    const rows = await this.db
      .select({
        sequenceId: sequences.id,
        name: sequences.name,
        status: sequences.status,
        enrolled: countDistinctWhere(enrollments.id, matches(sql`${enrollments.id} is not null`)),
        replies: countDistinctWhere(enrollments.id, matches(sql`${enrollments.repliedAt} is not null`)),
        meetings: countDistinctWhere(enrollments.id, matches(sql`${enrollments.meetingBookedAt} is not null`)),
      })
      .from(sequences)
      .leftJoin(enrollments, eq(enrollments.sequenceId, sequences.id))
      .leftJoin(contacts, eq(contacts.id, enrollments.contactId))
      .where(eq(sequences.projectId, projectId))
      .groupBy(sequences.id, sequences.name, sequences.status)
      .orderBy(asc(sequences.name));
    return rows;
  }
}

function enrollmentScope(f: AnalyticsFilter): SQL | undefined {
  return and(
    eq(enrollments.projectId, f.projectId),
    eq(enrollments.sequenceId, f.sequenceId),
    f.versionId ? eq(enrollments.versionId, f.versionId) : undefined,
    f.from ? gte(enrollments.enrolledAt, f.from) : undefined,
    f.to ? lt(enrollments.enrolledAt, f.to) : undefined,
    f.senderId ? eq(enrollments.senderId, f.senderId) : undefined,
    f.country ? eq(contacts.country, f.country) : undefined
  );
}

function runScope(f: AnalyticsFilter): SQL | undefined {
  return and(
    eq(runs.projectId, f.projectId),
    eq(runs.sequenceId, f.sequenceId),
    f.versionId ? eq(runs.versionId, f.versionId) : undefined,
    f.from ? gte(runs.createdAt, f.from) : undefined,
    f.to ? lt(runs.createdAt, f.to) : undefined,
    f.senderId ? eq(runs.senderId, f.senderId) : undefined,
    f.country ? eq(contacts.country, f.country) : undefined
  );
}

/** Median of (reply time − touch time) over attributed replies, in seconds; null without replies. */
function medianSecondsToReply() {
  return sql<number | null>`extract(epoch from percentile_cont(0.5) within group (order by ${signals.occurredAt} - ${runs.finishedAt}) filter (where ${IS_REPLY}))`.mapWith((v) =>
    v === null || v === undefined ? null : Number(v)
  );
}
