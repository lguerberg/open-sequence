/** Project settings, provider credentials (write-only), API keys, flags, engine health (scope admin). */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createApiKey, setFlag, updateProjectSettings } from '@opensequence/engine';
import { alloProbe, alloRegisterWebhook, attioProbe } from '@opensequence/providers';
import { projectOf, requireProject } from '../auth.js';
import type { AppContext } from '../context.js';
import { ok } from '../envelope.js';
import { alloNumber, alloUser, apiKeySummary, createdApiKey, createdResponse, credential, crmSchema, engineHealth, flagValue, okResponse, project, projectView, revoked } from '../responses.js';
import { idParam } from '../schemas.js';

const providerParam = z.object({ provider: z.enum(['allo', 'attio', 'mock']) });

export async function projectRoutes(fastify: FastifyInstance, ctx: AppContext) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const admin = requireProject(ctx.deps, 'admin');
  const read = requireProject(ctx.deps, 'read');

  app.get('/v1/project', {
    preHandler: read,
    schema: { tags: ['Project'], summary: 'The project, its settings, provider credential status and webhook URLs', response: okResponse(projectView) },
    handler: async (req, reply) => {
      const projectId = projectOf(req);
      const project = await ctx.deps.uow.repos.projects.byId(projectId);
      const credentials = await ctx.auth.listCredentials(projectId);
      const base = ctx.env.SEQ_PUBLIC_URL;
      return ok(reply, {
        project,
        credentials,
        webhook_urls: { allo: `${base}/hooks/allo/${project?.slug}`, mock: ctx.mock ? `${base}/hooks/mock/${project?.slug}` : undefined },
      });
    },
  });

  app.put('/v1/project/settings', {
    preHandler: admin,
    schema: { tags: ['Project'], summary: 'Update settings (merged)', body: z.record(z.string(), z.unknown()), response: okResponse(project) },
    handler: async (req, reply) => ok(reply, await updateProjectSettings(ctx.deps, projectOf(req), req.body)),
  });

  app.put('/v1/project/providers/:provider', {
    preHandler: admin,
    schema: {
      tags: ['Project'],
      summary: 'Store or rotate a provider credential (write-only). Allo: api_key, webhook_secret?; Attio: api_key.',
      params: providerParam,
      body: z.record(z.string(), z.string()),
      response: okResponse(credential),
    },
    handler: async (req, reply) => {
      const projectId = projectOf(req);
      const { provider } = req.params;
      const probe = provider === 'allo' ? (s: Record<string, string>) => alloProbe(s['api_key'] ?? '') : provider === 'attio' ? (s: Record<string, string>) => attioProbe(s['api_key'] ?? '') : undefined;
      let secrets = req.body;
      // Allo: register our own webhook endpoint at the provider and keep its signing secret.
      if (provider === 'allo' && !ctx.mock) {
        const project = await ctx.deps.uow.repos.projects.byId(projectId);
        const registered = await alloRegisterWebhook(secrets['api_key'] ?? '', `${ctx.env.SEQ_PUBLIC_URL}/hooks/allo/${project?.slug}`, ['sms.received', 'sms.sent', 'call.completed']);
        secrets = { ...secrets, webhook_secret: registered.signingSecret, webhook_id: registered.id };
      }
      const view = await ctx.auth.registerCredential({ tenantId: projectId, provider, method: 'api_key', secrets, probe });
      return ok(reply, view);
    },
  });

  app.get('/v1/project/providers/allo/numbers', {
    preHandler: read,
    schema: { tags: ['Project'], summary: 'Numbers the Allo key can see (for pickers)', response: okResponse(z.array(alloNumber)) },
    handler: async (req, reply) => ok(reply, await ctx.deps.providers.sms.listNumbers(projectOf(req))),
  });

  app.get('/v1/project/providers/allo/users', {
    preHandler: read,
    schema: { tags: ['Project'], summary: 'Allo team members (for mapping senders)', response: okResponse(z.array(alloUser)) },
    handler: async (req, reply) => ok(reply, await ctx.deps.providers.sms.listUsers(projectOf(req))),
  });

  app.get('/v1/project/providers/attio/schema', {
    preHandler: read,
    schema: { tags: ['Project'], summary: 'Attio objects and attributes, for crm.* condition pickers', response: okResponse(crmSchema) },
    handler: async (req, reply) => ok(reply, await ctx.deps.providers.crm.schema(projectOf(req))),
  });

  app.get('/v1/api-keys', {
    preHandler: admin,
    schema: { tags: ['Project'], summary: 'List API keys (prefix only)', response: okResponse(z.array(apiKeySummary)) },
    handler: async (req, reply) => {
      const keys = await ctx.deps.uow.repos.projects.listApiKeys(projectOf(req));
      return ok(reply, keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes, last_used_at: k.lastUsedAt, revoked_at: k.revokedAt, created_at: k.createdAt })));
    },
  });

  app.post('/v1/api-keys', {
    preHandler: admin,
    schema: { tags: ['Project'], summary: 'Create an API key (shown once)', body: z.object({ name: z.string().min(1).max(80), scopes: z.array(z.enum(['read', 'enroll', 'admin'])).min(1) }), response: createdResponse(createdApiKey) },
    handler: async (req, reply) => {
      const { key, secret } = await createApiKey(ctx.deps, { projectId: projectOf(req), ...req.body });
      return ok(reply, { key: { id: key.id, name: key.name, prefix: key.prefix, scopes: key.scopes, created_at: key.createdAt }, api_key: secret }, { status: 201 });
    },
  });

  app.delete('/v1/api-keys/:id', {
    preHandler: admin,
    schema: { tags: ['Project'], summary: 'Revoke an API key', params: idParam, response: okResponse(revoked) },
    handler: async (req, reply) => {
      await ctx.deps.uow.repos.projects.revokeApiKey(projectOf(req), req.params.id);
      return ok(reply, { revoked: true });
    },
  });

  app.get('/v1/engine/health', {
    preHandler: admin,
    schema: { tags: ['Engine'], summary: "This project's flags, queue depths and job state", response: okResponse(engineHealth) },
    handler: async (req, reply) => {
      const projectId = projectOf(req);
      const [flags, queues, jobs] = await Promise.all([ctx.deps.uow.repos.projects.listFlags(projectId), ctx.deps.queue.stats(), ctx.deps.uow.repos.scheduler.lastRuns()]);
      return ok(reply, { flags, queues, jobs, paused: ctx.deps.config.paused });
    },
  });

  app.put('/v1/engine/flags/:key', {
    preHandler: admin,
    schema: { tags: ['Engine'], summary: 'Flip a kill switch: global or channel:<name>', params: z.object({ key: z.string() }), body: z.object({ value: z.boolean() }), response: okResponse(flagValue) },
    handler: async (req, reply) => {
      await setFlag(ctx.deps, projectOf(req), req.params.key, req.body.value, req.auth?.keyId ?? null);
      return ok(reply, { key: req.params.key, value: req.body.value });
    },
  });
}
