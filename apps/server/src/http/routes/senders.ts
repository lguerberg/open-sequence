/** Senders: the acting users, their Google or SMTP connection and their channels. */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { channelPatchSchema, emailProviderOf, patchChannel, resolveSender, senderInputSchema, senderReadiness, setChannel, upsertSender, listTasks } from '@opensequence/engine';
import { splitSmtpCredentials } from '@opensequence/providers';
import { projectOf, requireProject } from '../auth.js';
import type { AppContext } from '../context.js';
import { fail, ok } from '../envelope.js';
import { idParam, listQuerySchema, responses } from '../schemas.js';

const mailServer = z
  .object({
    host: z.string().min(1).max(253).describe('The server name, like smtp.fastmail.com or imap.fastmail.com.'),
    port: z.number().int().min(1).max(65535).describe('SMTP: 465 (secure) or 587 (STARTTLS). IMAP: 993 (secure) or 143 (STARTTLS).'),
    secure: z.boolean().describe('true: TLS from the first byte (465, 993). false: STARTTLS, which is required unless the host is localhost.'),
    user: z.string().min(1).max(320).describe('The login, usually the full mailbox address.'),
    password: z.string().min(1).max(1024).describe('Write-only: an app password where the provider has them. Stored encrypted, never returned or logged.'),
  })
  .strict();

const smtpChannelBody = z
  .object({
    provider: z.literal('smtp'),
    from: z.string().email().max(320).optional().describe('The address mail goes out from. Defaults to the SMTP user when that is an address, else the sender email.'),
    smtp: mailServer,
    imap: mailServer,
  })
  .strict();

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
        const channel = await setChannel(ctx.deps, projectId, sender.id, { channel: 'email', address, connectionId: `con_mock_${sender.id}`, status: 'active', config: { provider: 'google' } });
        return ok(reply, { status: 'active', mock: true, channel });
      }
      const out = await ctx.auth.connect({ tenantId: projectId, ownerId: sender.id, returnUrl: req.body?.return_url });
      return ok(reply, { auth_url: out.authUrl, connection_id: out.connectionId });
    },
  });

  app.put('/v1/senders/:id/channels/email', {
    preHandler: admin,
    schema: {
      tags: ['Senders'],
      summary: 'Send from any mailbox over SMTP, read replies over IMAP; both logins are checked before anything is stored',
      description: 'Replaces the sender email channel, whatever it was before. Passwords are encrypted at rest and never returned. 422 with SMTP_AUTH_FAILED, IMAP_AUTH_FAILED, SMTP_UNREACHABLE, IMAP_UNREACHABLE, SMTP_REFUSED or IMAP_REFUSED when a login fails.',
      params: idParam,
      body: smtpChannelBody,
      response: responses,
    },
    handler: async (req, reply) => {
      const projectId = projectOf(req);
      const sender = await resolveSender(ctx.deps, projectId, req.params.id);
      const { from, smtp, imap } = req.body;
      const address = (from ?? (z.string().email().safeParse(smtp.user).success ? smtp.user : sender.email) ?? '').toLowerCase();
      if (!address) return fail(reply, 422, { code: 'FROM_REQUIRED', message: 'Say which address mail goes out from: set "from", or use the full mailbox address as the SMTP user.' });
      const probe = await ctx.probeMailbox({ smtp, imap });
      if (!probe.ok) return fail(reply, 422, { code: probe.code ?? 'SMTP_REFUSED', message: probe.error ?? 'The mail server refused the settings.' });
      const { config, secrets } = splitSmtpCredentials({ smtp, imap });
      const connection = await ctx.auth.savePasswordConnection({ tenantId: projectId, ownerId: sender.id, provider: 'smtp', account: address, config, secrets });
      // A new mailbox starts reading from its current position; the previous mailbox's cursor means nothing here.
      return ok(reply, await setChannel(ctx.deps, projectId, sender.id, { channel: 'email', address, connectionId: connection.id, status: 'active', config: { provider: 'smtp', imap_cursor: null } }));
    },
  });

  app.get('/v1/senders/:id/connections', {
    preHandler: admin,
    schema: { tags: ['Senders'], summary: 'Google and SMTP connections of a sender (no secrets)', params: idParam, response: responses },
    handler: async (req, reply) => {
      const projectId = projectOf(req);
      const sender = await resolveSender(ctx.deps, projectId, req.params.id);
      return ok(reply, await ctx.auth.listConnections(projectId, sender.id));
    },
  });

  app.delete('/v1/senders/:id/connections/google', {
    preHandler: admin,
    schema: { tags: ['Senders'], summary: 'Disconnect Google: revokes the token; a Gmail email channel goes disconnected (an SMTP one is left alone)', params: idParam, response: responses },
    handler: async (req, reply) => {
      const projectId = projectOf(req);
      const sender = await resolveSender(ctx.deps, projectId, req.params.id);
      const connections = await ctx.auth.listConnections(projectId, sender.id);
      for (const c of connections.filter((x) => x.provider === 'google')) await ctx.auth.revoke(c.id);
      const email = await ctx.deps.uow.repos.senders.channel(sender.id, 'email');
      if (email && emailProviderOf(email) === 'google') await ctx.deps.uow.repos.senders.updateChannel(email.id, { status: 'disconnected' });
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

  app.patch('/v1/senders/:id/channels/:channel', {
    preHandler: admin,
    schema: { tags: ['Senders'], summary: 'Limits and status of a channel', params: z.object({ id: z.string(), channel: z.enum(['email', 'sms']) }), body: channelPatchSchema, response: responses },
    handler: async (req, reply) => {
      const projectId = projectOf(req);
      const sender = await resolveSender(ctx.deps, projectId, req.params.id);
      return ok(reply, await patchChannel(ctx.deps, projectId, sender.id, req.params.channel, req.body));
    },
  });

  app.delete('/v1/senders/:id/channels/:channel', {
    preHandler: admin,
    schema: { tags: ['Senders'], summary: 'Remove a channel; its steps skip from now on. Removing email deletes stored SMTP passwords; a Google grant stays until Google is disconnected', params: z.object({ id: z.string(), channel: z.enum(['sms', 'email']) }), response: responses },
    handler: async (req, reply) => {
      const projectId = projectOf(req);
      const sender = await resolveSender(ctx.deps, projectId, req.params.id);
      if (req.params.channel === 'email') {
        const connections = await ctx.auth.listConnections(projectId, sender.id);
        for (const c of connections.filter((x) => x.provider === 'smtp' && x.status !== 'disconnected')) await ctx.auth.revoke(c.id);
      }
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
