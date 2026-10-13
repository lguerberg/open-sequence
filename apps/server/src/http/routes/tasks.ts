/** Tasks the engine created for senders: list, read, complete, cancel. */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { cancelTask, completeTask, getTask, listTasks } from '@opensequence/engine';
import { projectOf, requireProject } from '../auth.js';
import type { AppContext } from '../context.js';
import { ok } from '../envelope.js';
import { idParam, listQuerySchema, responses } from '../schemas.js';

export async function taskRoutes(fastify: FastifyInstance, ctx: AppContext) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const enroll = requireProject(ctx.deps, 'enroll');
  const read = requireProject(ctx.deps, 'read');

  app.get('/v1/tasks', {
    preHandler: read,
    schema: { tags: ['Tasks'], summary: 'List tasks', querystring: listQuerySchema.extend({ sender: z.string().optional(), status: z.string().optional(), kind: z.string().optional(), contact: z.string().optional() }), response: responses },
    handler: async (req, reply) => {
      const { sender, status, kind, contact, ...opts } = req.query;
      const page = await listTasks(ctx.deps, projectOf(req), { senderId: sender, status, kind, contactId: contact }, opts);
      return ok(reply, page.items, { next_cursor: page.nextCursor });
    },
  });

  app.get('/v1/tasks/:id', {
    preHandler: read,
    schema: { tags: ['Tasks'], summary: 'A task', params: idParam, response: responses },
    handler: async (req, reply) => ok(reply, await getTask(ctx.deps, projectOf(req), req.params.id)),
  });

  app.post('/v1/tasks/:id/complete', {
    preHandler: enroll,
    schema: { tags: ['Tasks'], summary: 'Complete with an outcome; wakes the waiting step', params: idParam, body: z.object({ outcome: z.string().min(1).max(32), note: z.string().max(4000).optional() }), response: responses },
    handler: async (req, reply) => ok(reply, await completeTask(ctx.deps, projectOf(req), req.params.id, req.body, 'client')),
  });

  app.post('/v1/tasks/:id/cancel', {
    preHandler: enroll,
    schema: { tags: ['Tasks'], summary: 'Cancel an open task; the step takes no_answer', params: idParam, response: responses },
    handler: async (req, reply) => ok(reply, await cancelTask(ctx.deps, projectOf(req), req.params.id)),
  });
}
