/** Analytics (read): the only two outcomes are replies and meetings booked. */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { allSequences as allSequencesReport, resolveSequence, sequenceChannels as channelsReport, sequenceExits as exitsReport, sequenceNodes as nodesReport, sequenceSummary as summaryReport, type AnalyticsQuery, type Deps } from '@opensequence/engine';
import { projectOf, requireProject } from '../auth.js';
import type { AppContext } from '../context.js';
import { ok } from '../envelope.js';
import { allSequences, okResponse, sequenceChannels, sequenceExits, sequenceNodes, sequenceSummary } from '../responses.js';
import { idParam } from '../schemas.js';

const analyticsQuery = z.object({
  version: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sender: z.string().optional(),
  country: z.string().length(2).optional(),
});

type PerSequence = (deps: Deps, projectId: string, sequenceId: string, q: AnalyticsQuery) => Promise<unknown>;

export async function analyticsRoutes(fastify: FastifyInstance, ctx: AppContext) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const read = requireProject(ctx.deps, 'read');

  app.get('/v1/analytics/sequences', {
    preHandler: read,
    schema: { tags: ['Analytics'], summary: 'Every sequence with enrolled, replies, meetings and rates', querystring: analyticsQuery.extend({ min_enrolled: z.coerce.number().int().min(0).optional() }), response: okResponse(allSequences) },
    handler: async (req, reply) => {
      const { min_enrolled, ...q } = req.query;
      return ok(reply, await allSequencesReport(ctx.deps, projectOf(req), { ...(q as AnalyticsQuery), minEnrolled: min_enrolled }));
    },
  });

  const perSequence: Array<[string, string, PerSequence, z.ZodType]> = [
    ['summary', 'Enrolled, active, exited, completed, delivered touches, replies and meetings, with rates', summaryReport as PerSequence, sequenceSummary],
    ['exits', 'Exits by reason, largest first', exitsReport as PerSequence, sequenceExits],
    ['nodes', 'Per step: reached, executed, skipped by reason, failed, delivered, bounced, replies, meetings', nodesReport as PerSequence, sequenceNodes],
    ['channels', 'Per channel and touch number: sent, delivered, bounced, replies, meetings', channelsReport as PerSequence, sequenceChannels],
  ];
  for (const [name, summary, fn, data] of perSequence) {
    app.get(`/v1/sequences/:id/analytics/${name}`, {
      preHandler: read,
      schema: { tags: ['Analytics'], summary, params: idParam, querystring: analyticsQuery, response: okResponse(data) },
      handler: async (req, reply) => {
        const projectId = projectOf(req);
        const s = await resolveSequence(ctx.deps, projectId, req.params.id);
        return ok(reply, await fn(ctx.deps, projectId, s.id, req.query as AnalyticsQuery));
      },
    });
  }
}
