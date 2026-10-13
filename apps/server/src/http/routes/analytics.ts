/** Analytics (read): the only two outcomes are replies and meetings booked. */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { allSequences, resolveSequence, sequenceChannels, sequenceExits, sequenceNodes, sequenceSummary, type AnalyticsQuery, type Deps } from '@opensequence/engine';
import { projectOf, requireProject } from '../auth.js';
import type { AppContext } from '../context.js';
import { ok } from '../envelope.js';
import { idParam, responses } from '../schemas.js';

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
    schema: { tags: ['Analytics'], summary: 'Every sequence with enrolled, replies, meetings and rates', querystring: analyticsQuery.extend({ min_enrolled: z.coerce.number().int().min(0).optional() }), response: responses },
    handler: async (req, reply) => {
      const { min_enrolled, ...q } = req.query;
      return ok(reply, await allSequences(ctx.deps, projectOf(req), { ...(q as AnalyticsQuery), minEnrolled: min_enrolled }));
    },
  });

  const perSequence: Array<[string, PerSequence]> = [
    ['summary', sequenceSummary as PerSequence],
    ['exits', sequenceExits as PerSequence],
    ['nodes', sequenceNodes as PerSequence],
    ['channels', sequenceChannels as PerSequence],
  ];
  for (const [name, fn] of perSequence) {
    app.get(`/v1/sequences/:id/analytics/${name}`, {
      preHandler: read,
      schema: { tags: ['Analytics'], summary: `Sequence ${name}`, params: idParam, querystring: analyticsQuery, response: responses },
      handler: async (req, reply) => {
        const projectId = projectOf(req);
        const s = await resolveSequence(ctx.deps, projectId, req.params.id);
        return ok(reply, await fn(ctx.deps, projectId, s.id, req.query as AnalyticsQuery));
      },
    });
  }
}
