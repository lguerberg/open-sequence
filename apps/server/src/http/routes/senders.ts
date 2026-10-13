/** Senders: the acting users, their Google connection and their channels. */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { channelPatchSchema, patchChannel, resolveSender, senderInputSchema, senderReadiness, setChannel, upsertSender, listTasks } from '@opensequence/engine';
import { projectOf, requireProject } from '../auth.js';
import type { AppContext } from '../context.js';
import { ok } from '../envelope.js';
import { idParam, listQuerySchema, responses } from '../schemas.js';

export async function senderRoutes(fastify: FastifyInstance, ctx: AppContext) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const admin = requireProject(ctx.deps, 'admin');
  const read = requireProject(ctx.deps, 'read');

  app.put('/v1/senders/:id', {
    preHandler: admin,
    schema: { tags: ['Senders'], summary: 'Create or update a sender by your own id', params: idParam, body: senderInputSchema, response: responses },
    handler: async (req, reply) => ok(reply, await upsertSender(ctx.deps, projectOf(req), req.params.id, req.body)),
  });

  app.get('/v1/senders', {
    preHandler: read,
    schema: { tags: ['Senders'], summary: 'List senders', querystring: listQuerySchema, response: responses },
    handler: async (req, reply) => {
      const page = await ctx.deps.uow.repos.senders.list(projectOf(req), req.query);
      return ok(reply, page.items, { next_cursor: page.nextCursor });
    },
  });

  app.get('/v1/senders/:id', {
    preHandler: read,
    schema: { tags: ['Senders'], summary: 'A sender with channels, connections and readiness', params: idParam, response: responses },
    handler: async (req, reply) => {
      const projectId = projectOf(req);
      const sender = await resolveSender(ctx.deps, projectId, req.params.id);
      const [channels, readiness, connections] = await Promise.all([ctx.deps.uow.repos.senders.channels(sender.id), senderReadiness(ctx.deps, sender.id), ctx.auth.listConnections(projectId, sender.id)]);
      return ok(reply, { ...sender, channels, readiness, connections });
    },
  });

  app.get('/v1/senders/:id/readiness', {
    preHandler: read,
    schema: { tags: ['Senders'], summary: 'Which steps this sender can run, and why not', params: idParam, response: responses },
    handler: async (req, reply) => {
      const sender = await resolveSender(ctx.deps, projectOf(req), req.params.id);
      return ok(reply, await senderReadiness(ctx.deps, sender.id));
    },
  });

  app.post('/v1/senders/:id/connections/google', {
    preHandler: admin,
    schema: { tags: ['Senders'], summary: 'Start the Google consent flow (Gmail + Calendar); returns the URL the sender opens once', params: idParam, body: z.object({ return_url: z.string().url().optional() }).optional(), response: responses },
    handler: async (req, reply) => {
      const projectId = projectOf(req);
      const sender = await resolveSender(ctx.deps, projectId, req.params.id);
      if (ctx.mock) {
        // Development: no Google, no consent screen; the sender gets an active mailbox at their address.
        const address = sender.email ?? `${sender.externalId}@mock.local`;
        const channel = await setChannel(ctx.deps, projectId, sender.id, { channel: 'email', address, connectionId: `con_mock_${sender.id}`, status: 'active' });
        return ok(reply, { status: 'active', mock: true, channel });
      }
      const out = await ctx.auth.connect({ tenantId: projectId, ownerId: sender.id, returnUrl: req.body?.return_url });
      return ok(reply, { auth_url: out.authUrl, connection_id: out.connectionId });
    },
  });

  app.get('/v1/senders/:id/connections', {
    preHandler: admin,
    schema: { tags: ['Senders'], summary: 'OAuth connections of a sender (no secrets)', params: idParam, response: responses },
    handler: async (req, reply) => {
      const projectId = projectOf(req);
      const sender = await resolveSender(ctx.deps, projectId, req.params.id);
      return ok(reply, await ctx.auth.listConnections(projectId, sender.id));
    },
  });

  app.delete('/v1/senders/:id/connections/google', {
    preHandler: admin,
    schema: { tags: ['Senders'], summary: 'Disconnect Google: revokes the token, the email channel goes disconnected', params: idParam, response: responses },
    handler: async (req, reply) => {
      const projectId = projectOf(req);
      const sender = await resolveSender(ctx.deps, projectId, req.params.id);
      const connections = await ctx.auth.listConnections(projectId, sender.id);
      for (const c of connections.filter((x) => x.provider === 'google')) await ctx.auth.revoke(c.id);
      const email = await ctx.deps.uow.repos.senders.channel(sender.id, 'email');
      if (email) await ctx.deps.uow.repos.senders.updateChannel(email.id, { status: 'disconnected' });
      return ok(reply, { disconnected: true });
    },
  });

  app.put('/v1/senders/:id/channels/sms', {
    preHandler: admin,
    schema: { tags: ['Senders'], summary: "The sender's Allo number and user (API key provider, no OAuth)", params: idParam, body: z.object({ allo_user_id: z.string().min(1), number: z.string().min(5) }), response: responses },
    handler: async (req, reply) => {
      const projectId = projectOf(req);
      const sender = await resolveSender(ctx.deps, projectId, req.params.id);
      const numbers = await ctx.deps.providers.sms.listNumbers(projectId);
      const match = numbers.find((n) => n.address === req.body.number);
      if (numbers.length && !match) return reply.status(422).send({ success: false, error: { code: 'UNKNOWN_NUMBER', message: `${req.body.number} is not a number the Allo key can see.` }, meta: { request_id: req.id } });
      if (match && !match.capabilities.includes('SMS')) return reply.status(422).send({ success: false, error: { code: 'NUMBER_HAS_NO_SMS', message: `${req.body.number} cannot send SMS.` }, meta: { request_id: req.id } });
      return ok(reply, await setChannel(ctx.deps, projectId, sender.id, { channel: 'sms', address: req.body.number, config: { allo_user_id: req.body.allo_user_id } }));
    },
  });

  app.put('/v1/senders/:id/channels/linkedin', {
    preHandler: admin,
    schema: { tags: ['Senders'], summary: "The sender's LinkedIn profile URL (manual channel)", params: idParam, body: z.object({ address: z.string().url() }), response: responses },
    handler: async (req, reply) => {
      const projectId = projectOf(req);
      const sender = await resolveSender(ctx.deps, projectId, req.params.id);
      return ok(reply, await setChannel(ctx.deps, projectId, sender.id, { channel: 'linkedin', address: req.body.address }));
    },
  });

  app.patch('/v1/senders/:id/channels/:channel', {
    preHandler: admin,
    schema: { tags: ['Senders'], summary: 'Limits and status of a channel', params: z.object({ id: z.string(), channel: z.enum(['email', 'sms', 'linkedin']) }), body: channelPatchSchema, response: responses },
    handler: async (req, reply) => {
      const projectId = projectOf(req);
      const sender = await resolveSender(ctx.deps, projectId, req.params.id);
      return ok(reply, await patchChannel(ctx.deps, projectId, sender.id, req.params.channel, req.body));
    },
  });

  app.delete('/v1/senders/:id/channels/:channel', {
    preHandler: admin,
    schema: { tags: ['Senders'], summary: 'Remove a channel; its steps skip from now on', params: z.object({ id: z.string(), channel: z.enum(['sms', 'linkedin']) }), response: responses },
    handler: async (req, reply) => {
      const sender = await resolveSender(ctx.deps, projectOf(req), req.params.id);
      await ctx.deps.uow.repos.senders.deleteChannel(sender.id, req.params.channel);
      return ok(reply, { deleted: true });
    },
  });

  app.delete('/v1/senders/:id', {
    preHandler: admin,
    schema: { tags: ['Senders'], summary: 'Disable a sender (their enrollments pause; nothing is deleted)', params: idParam, response: responses },
    handler: async (req, reply) => {
      const projectId = projectOf(req);
      const sender = await resolveSender(ctx.deps, projectId, req.params.id);
      await ctx.deps.uow.repos.senders.setStatus(projectId, sender.id, 'disabled');
      return ok(reply, { disabled: true });
    },
  });

  app.get('/v1/senders/:id/tasks', {
    preHandler: read,
    schema: { tags: ['Tasks'], summary: "A sender's tasks", params: idParam, querystring: listQuerySchema.extend({ status: z.string().optional(), kind: z.string().optional() }), response: responses },
    handler: async (req, reply) => {
      const projectId = projectOf(req);
      const sender = await resolveSender(ctx.deps, projectId, req.params.id);
      const { status, kind, ...opts } = req.query;
      const page = await listTasks(ctx.deps, projectId, { senderId: sender.id, status: status ?? 'open', kind }, opts);
      return ok(reply, page.items, { next_cursor: page.nextCursor });
    },
  });
}
