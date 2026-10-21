/**
 * Unsubscribes for integrators who host the unsubscribe page in their own app (project setting
 * `unsubscribe_url`): GET reads a token for a confirmation page, POST applies it. Scope `enroll`,
 * the scope that writes contacts and their suppressions.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { applyUnsubscribe, getUnsubscribe } from '@opensequence/engine';
import { projectOf, requireProject } from '../auth.js';
import type { AppContext } from '../context.js';
import { ok } from '../envelope.js';
import { okResponse, unsubscribeStatus } from '../responses.js';

const tokenParam = z.object({ token: z.string().min(1).max(2048).describe('The signed token from the unsubscribe link.') });

export async function unsubscribeRoutes(fastify: FastifyInstance, ctx: AppContext) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const enroll = requireProject(ctx.deps, 'enroll');

  app.get('/v1/unsubscribes/:token', {
    preHandler: enroll,
    schema: {
      tags: ['Unsubscribes'],
      summary: 'Read an unsubscribe token without applying it, for a confirmation page',
      description: 'Always 200: an unknown, altered or other-project token reads `valid: false`; an expired one `expired: true`.',
      params: tokenParam,
      response: okResponse(unsubscribeStatus),
    },
    handler: async (req, reply) => ok(reply, await getUnsubscribe(ctx.deps, req.params.token, projectOf(req))),
  });

  app.post('/v1/unsubscribes/:token', {
    preHandler: enroll,
    schema: {
      tags: ['Unsubscribes'],
      summary: 'Apply an unsubscribe token: suppress email for the contact and exit its enrollments',
      description:
        'Idempotent: a second call changes nothing and returns `already_unsubscribed: true`. 400 `UNSUBSCRIBE_TOKEN_INVALID` or `UNSUBSCRIBE_TOKEN_EXPIRED` otherwise.',
      params: tokenParam,
      response: okResponse(unsubscribeStatus),
    },
    handler: async (req, reply) => ok(reply, await applyUnsubscribe(ctx.deps, req.params.token, projectOf(req))),
  });
}
