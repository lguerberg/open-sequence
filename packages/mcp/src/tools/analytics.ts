/** Analytics (read-only). The only two outcomes are replies and meetings booked. */
import type { AnalyticsQuery, OpenSequence, SequenceSummary } from '@opensequence/sdk';
import { z } from 'zod';
import {
  ToolError,
  analyticsFilters,
  bullets,
  compact,
  count,
  defineTool,
  isServiceId,
  lines,
  ref,
  senderId,
  versionId,
} from '../tool.js';

type Filters = {
  sequence?: string;
  version?: string;
  from?: string;
  to?: string;
  sender?: string;
  country?: string;
};

/** The analytics query with the sender and version turned into service ids. */
async function analyticsQuery(client: OpenSequence, args: Filters): Promise<AnalyticsQuery> {
  let version = args.version;
  if (version !== undefined && !isServiceId(version, 'ver')) {
    if (!args.sequence)
      throw new ToolError(
        'SEQUENCE_REQUIRED',
        `"${version}" looks like a version tag; pass the sequence too, or use the version id (ver_…).`
      );
    version = await versionId(client, args.sequence, version);
  }
  return compact({
    version,
    from: args.from,
    to: args.to,
    sender: await senderId(client, args.sender),
    country: args.country?.toUpperCase(),
  });
}

function rate(n: number | null): string {
  return n === null ? 'n/a' : String(n);
}

function summaryText(s: SequenceSummary): string {
  const byChannel = Object.entries(s.replies_by_channel ?? {})
    .map(([c, n]) => `${c} ${n}`)
    .join(', ');
  return lines(
    `${s.sequence}: ${s.enrolled} enrolled (${s.active} active, ${s.exited} exited, ${s.completed} completed); ${s.touches_delivered} touches delivered.`,
    `${count(s.replies, 'reply', 'replies')} (${rate(s.reply_rate_per_100_enrolled)} per 100 enrolled, ${rate(s.reply_rate_per_100_delivered)} per 100 delivered); ${count(s.meetings, 'meeting')} booked (${rate(s.meeting_rate_per_100_enrolled)} per 100 enrolled, ${rate(s.meeting_rate_per_100_delivered)} per 100 delivered).`,
    byChannel ? `Replies by channel: ${byChannel}.` : null
  );
}

export const analyticsSummary = defineTool({
  name: 'analytics_summary',
  title: 'Sequence results',
  description:
    'How a sequence performs: enrolled, active, exited, touches delivered, replies and meetings booked, with rates per 100 enrolled and per 100 delivered, and replies by channel. Leave out `sequence` to rank every sequence by replies then meetings per 100 enrolled. Filters: version, from, to, sender, country.',
  scope: 'read',
  input: {
    sequence: ref('sequence', 'seq_01J9…', 'uk-intro')
      .optional()
      .describe('The sequence: service id or external id. Leave out to compare every sequence.'),
    ...analyticsFilters,
    min_enrolled: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Without `sequence`: hide sequences with fewer enrolled than this.'),
  },
  async run(client, args) {
    const query = await analyticsQuery(client, args);
    if (args.sequence) {
      const s = await client.analytics.summary(args.sequence, query);
      return { summary: summaryText(s), data: s };
    }
    const all = await client.analytics.sequences(
      compact({ ...query, min_enrolled: args.min_enrolled })
    );
    const rows = all.sequences.map(
      (r) =>
        `${r.name} (${r.sequence}, ${r.status}): ${r.enrolled} enrolled, ${count(r.replies, 'reply', 'replies')} (${rate(r.replies_per_100_enrolled)}/100), ${count(r.meetings, 'meeting')} (${rate(r.meetings_per_100_enrolled)}/100)`
    );
    return {
      summary: lines(`${count(all.sequences.length, 'sequence')}, best first.`, bullets(rows, 25)),
      data: all,
    };
  },
});

export const analyticsNodes = defineTool({
  name: 'analytics_nodes',
  title: 'Results per step',
  description:
    'How each step of a sequence performs: reached, executed, skipped (by reason), failed, delivered, bounced, replies, meetings and median time to reply. Use it to find the step that loses people or the email that gets replies.',
  scope: 'read',
  input: {
    sequence: ref('sequence', 'seq_01J9…', 'uk-intro'),
    ...analyticsFilters,
  },
  async run(client, args) {
    const report = await client.analytics.nodes(args.sequence, await analyticsQuery(client, args));
    const rows = report.nodes.map((n) => {
      const what = [n.node_type, n.channel].filter(Boolean).join(' ');
      const skipped = n.skipped
        ? `, skipped ${n.skipped} (${Object.entries(n.skipped_by_reason ?? {})
            .map(([r, c]) => `${r} ${c}`)
            .join(', ')})`
        : '';
      const failed = n.failed ? `, failed ${n.failed}` : '';
      return `${n.node_id} (${what}): reached ${n.reached}, delivered ${n.delivered}, bounced ${n.bounced}, ${count(n.replies, 'reply', 'replies')}, ${count(n.meetings, 'meeting')}${skipped}${failed}`;
    });
    return {
      summary: lines(
        `${count(report.nodes.length, 'step')} in ${report.sequence}:`,
        bullets(rows, 30)
      ),
      data: report,
    };
  },
});
