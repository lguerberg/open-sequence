/** Operator endpoints (SEQ_ADMIN_TOKEN): create projects and keys, platform-wide health. */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createApiKey, createProject, projectSettingsSchema } from '@opensequence/engine';
import { requireOperator } from '../auth.js';
import type { AppContext } from '../context.js';
import { ok } from '../envelope.js';
import { idParam, responses } from '../schemas.js';

export async function adminRoutes(fastify: FastifyInstance, ctx: AppContext) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const operator = requireOperator(ctx.env.SEQ_ADMIN_TOKEN!);

  app.post('/v1/admin/projects', {
    preHandler: operator,
    schema: {
      tags: ['Operator'],
      summary: 'Create a project and its first admin key (shown once)',
      body: z.object({ slug: z.string().min(3).max(48), name: z.string().min(1).max(120), settings: projectSettingsSchema.optional() }),
      response: responses,
    },
    handler: async (req, reply) => {
      const { project, apiKey } = await createProject(ctx.deps, req.body);
      return ok(reply, { project, api_key: apiKey }, { status: 201 });
    },
  });

  app.get('/v1/admin/projects', {
    preHandler: operator,
    schema: { tags: ['Operator'], summary: 'List projects', response: responses },
    handler: async (_req, reply) => ok(reply, await ctx.deps.uow.repos.projects.list()),
  });

  app.post('/v1/admin/projects/:id/api-keys', {
    preHandler: operator,
    schema: {
      tags: ['Operator'],
      summary: 'Create an API key for a project (shown once)',
      params: idParam,
      body: z.object({ name: z.string().min(1).max(80), scopes: z.array(z.enum(['read', 'enroll', 'admin'])).min(1) }),
      response: responses,
    },
    handler: async (req, reply) => {
      const { key, secret } = await createApiKey(ctx.deps, { projectId: req.params.id, ...req.body });
      return ok(reply, { key: { id: key.id, name: key.name, prefix: key.prefix, scopes: key.scopes, created_at: key.createdAt }, api_key: secret }, { status: 201 });
    },
  });

  app.get('/v1/admin/engine/health', {
    preHandler: operator,
    schema: { tags: ['Operator'], summary: 'Platform-wide queue depths and job state', response: responses },
    handler: async (_req, reply) => {
      const [queues, jobs] = await Promise.all([ctx.deps.queue.stats(), ctx.deps.uow.repos.scheduler.lastRuns()]);
      return ok(reply, { paused: ctx.deps.config.paused, disabled_channels: [...ctx.deps.config.disabledChannels], queues, jobs });
    },
  });
}
