/** Outbound webhook endpoints (scope admin): the client tells us where to send events. */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createEndpoint, deleteEndpoint, enableEndpoint, endpointInputSchema, endpointPatchSchema, getEndpoint, listDeliveries, listEndpoints, recoverEndpoint, replayDelivery, rotateSecret, updateEndpoint } from '@opensequence/engine';
import { projectOf, requireProject } from '../auth.js';
import type { AppContext } from '../context.js';
import { ok } from '../envelope.js';
import { idParam, listQuerySchema, responses } from '../schemas.js';

export async function webhookRoutes(fastify: FastifyInstance, ctx: AppContext) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const admin = requireProject(ctx.deps, 'admin');

  app.get('/v1/webhooks', { preHandler: admin, schema: { tags: ['Webhooks'], summary: 'List endpoints', response: responses }, handler: async (req, reply) => ok(reply, await listEndpoints(ctx.deps, projectOf(req))) });

  app.post('/v1/webhooks', {
    preHandler: admin,
    schema: { tags: ['Webhooks'], summary: 'Create an endpoint; the signing secret is shown once', body: endpointInputSchema, response: responses },
    handler: async (req, reply) => ok(reply, await createEndpoint(ctx.deps, projectOf(req), req.body), { status: 201 }),
  });

  app.get('/v1/webhooks/:id', { preHandler: admin, schema: { tags: ['Webhooks'], summary: 'An endpoint', params: idParam, response: responses }, handler: async (req, reply) => ok(reply, await getEndpoint(ctx.deps, projectOf(req), req.params.id)) });

  app.patch('/v1/webhooks/:id', {
    preHandler: admin,
    schema: { tags: ['Webhooks'], summary: 'Change url or event types', params: idParam, body: endpointPatchSchema, response: responses },
    handler: async (req, reply) => ok(reply, await updateEndpoint(ctx.deps, projectOf(req), req.params.id, req.body)),
  });

  app.delete('/v1/webhooks/:id', {
    preHandler: admin,
    schema: { tags: ['Webhooks'], summary: 'Delete an endpoint', params: idParam, response: responses },
    handler: async (req, reply) => {
      await deleteEndpoint(ctx.deps, projectOf(req), req.params.id);
      return ok(reply, { deleted: true });
    },
  });

  app.post('/v1/webhooks/:id/rotate-secret', { preHandler: admin, schema: { tags: ['Webhooks'], summary: 'Rotate the signing secret (shown once)', params: idParam, response: responses }, handler: async (req, reply) => ok(reply, await rotateSecret(ctx.deps, projectOf(req), req.params.id)) });

  app.post('/v1/webhooks/:id/enable', { preHandler: admin, schema: { tags: ['Webhooks'], summary: 'Re-enable a disabled endpoint and replay what was held', params: idParam, response: responses }, handler: async (req, reply) => ok(reply, await enableEndpoint(ctx.deps, projectOf(req), req.params.id)) });

  app.post('/v1/webhooks/:id/recover', {
    preHandler: admin,
    schema: { tags: ['Webhooks'], summary: 'Re-send every failed delivery since a time', params: idParam, body: z.object({ since: z.coerce.date() }), response: responses },
    handler: async (req, reply) => ok(reply, await recoverEndpoint(ctx.deps, projectOf(req), req.params.id, req.body)),
  });

  app.get('/v1/webhooks/:id/deliveries', {
    preHandler: admin,
    schema: { tags: ['Webhooks'], summary: 'Deliveries of an endpoint', params: idParam, querystring: listQuerySchema, response: responses },
    handler: async (req, reply) => {
      const page = await listDeliveries(ctx.deps, projectOf(req), req.params.id, req.query);
      return ok(reply, page.items, { next_cursor: page.nextCursor });
    },
  });

  app.post('/v1/webhooks/deliveries/:id/replay', { preHandler: admin, schema: { tags: ['Webhooks'], summary: 'Re-send one delivery', params: idParam, response: responses }, handler: async (req, reply) => ok(reply, await replayDelivery(ctx.deps, projectOf(req), req.params.id)) });
}
