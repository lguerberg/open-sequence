/** Contacts: upsert, batch, patch, consent (admin), status, timeline, client events, delete. */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { clientEventSchema, contactStatuses, deleteContact, patchContact, reportClientEvent, resolveContact, setSmsConsent, upsertContact, upsertContacts } from '@opensequence/engine';
import { projectOf, requireProject } from '../auth.js';
import type { AppContext } from '../context.js';
import { ok } from '../envelope.js';
import { contactBody, idParam, listQuerySchema, responses } from '../schemas.js';

export async function contactRoutes(fastify: FastifyInstance, ctx: AppContext) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const admin = requireProject(ctx.deps, 'admin');
  const enroll = requireProject(ctx.deps, 'enroll');
  const read = requireProject(ctx.deps, 'read');

  app.put('/v1/contacts/:id', {
    preHandler: enroll,
    schema: { tags: ['Contacts'], summary: 'Create or update a contact by your own id (attrs are merged)', params: idParam, body: contactBody, response: responses },
    handler: async (req, reply) => ok(reply, await upsertContact(ctx.deps, projectOf(req), req.params.id, req.body)),
  });

  app.post('/v1/contacts::batch', {
    preHandler: enroll,
    schema: { tags: ['Contacts'], summary: 'Upsert up to 500 contacts', body: z.object({ contacts: z.array(contactBody.extend({ external_id: z.string().min(1).max(64) })).min(1).max(500) }), response: responses },
    handler: async (req, reply) => ok(reply, await upsertContacts(ctx.deps, projectOf(req), req.body.contacts)),
  });

  app.post('/v1/contacts::status', {
    preHandler: read,
    schema: { tags: ['Contacts'], summary: "Each contact's active enrollment or null (for badges)", body: z.object({ ids: z.array(z.string()).min(1).max(500) }), response: responses },
    handler: async (req, reply) => ok(reply, await contactStatuses(ctx.deps, projectOf(req), req.body.ids)),
  });

  app.post('/v1/contacts::events', {
    preHandler: enroll,
    schema: { tags: ['Contacts'], summary: 'Report up to 500 events the service cannot see (meetings, opt-outs, suppressions)', body: z.object({ events: z.array(clientEventSchema.extend({ contact: z.string().min(1) })).min(1).max(500) }), response: responses },
    handler: async (req, reply) => {
      const projectId = projectOf(req);
      const out = [];
      for (const { contact, ...event } of req.body.events) {
        const r = await reportClientEvent(ctx.deps, projectId, contact, event);
        out.push({ id: event.id, signal: r.signal.id, created: r.created });
      }
      return ok(reply, out);
    },
  });

  app.get('/v1/contacts', {
    preHandler: read,
    schema: { tags: ['Contacts'], summary: 'List contacts', querystring: listQuerySchema.extend({ email: z.string().optional(), external_id: z.string().optional() }), response: responses },
    handler: async (req, reply) => {
      const { email, external_id, ...opts } = req.query;
      const page = await ctx.deps.uow.repos.contacts.list(projectOf(req), { ...opts, email, externalId: external_id });
      return ok(reply, page.items, { next_cursor: page.nextCursor });
    },
  });

  app.get('/v1/contacts/:id', {
    preHandler: read,
    schema: { tags: ['Contacts'], summary: 'A contact with suppressions and the active enrollment', params: idParam, response: responses },
    handler: async (req, reply) => {
      const projectId = projectOf(req);
      const c = await resolveContact(ctx.deps, projectId, req.params.id);
      const [suppressions, status] = await Promise.all([ctx.deps.uow.repos.contacts.suppressions(c.id), contactStatuses(ctx.deps, projectId, [c.id])]);
      return ok(reply, { ...c, suppressions, enrollment: status[0]?.enrollment ?? null });
    },
  });

  app.get('/v1/contacts/:id/timeline', {
    preHandler: read,
    schema: { tags: ['Contacts'], summary: 'Messages, runs, signals and tasks for a contact, merged and ordered', params: idParam, response: responses },
    handler: async (req, reply) => {
      const projectId = projectOf(req);
      const c = await resolveContact(ctx.deps, projectId, req.params.id);
      const repos = ctx.deps.uow.repos;
      const [messages, signals, tasks] = await Promise.all([repos.messages.byContact(c.id, 200), repos.signals.byContact(c.id, 200), repos.tasks.list(projectId, { contactId: c.id }, { limit: 200 })]);
      const items = [
        ...messages.map((m) => ({ kind: 'message', at: m.occurredAt, item: m })),
        ...signals.map((s) => ({ kind: 'signal', at: s.occurredAt, item: s })),
        ...tasks.items.map((t) => ({ kind: 'task', at: t.createdAt, item: t })),
      ].sort((a, b) => b.at.getTime() - a.at.getTime());
      return ok(reply, items);
    },
  });

  app.patch('/v1/contacts/:id', {
    preHandler: enroll,
    schema: { tags: ['Contacts'], summary: 'Change fields; changing attrs keeps conditions fresh', params: idParam, body: contactBody, response: responses },
    handler: async (req, reply) => ok(reply, await patchContact(ctx.deps, projectOf(req), req.params.id, req.body)),
  });

  app.put('/v1/contacts/:id/sms-consent', {
    preHandler: admin,
    schema: { tags: ['Contacts'], summary: 'Record SMS consent (admin only)', params: idParam, body: z.object({ consent: z.boolean(), source: z.string().max(80).optional(), at: z.coerce.date().optional() }), response: responses },
    handler: async (req, reply) => ok(reply, await setSmsConsent(ctx.deps, projectOf(req), req.params.id, req.body)),
  });

  app.post('/v1/contacts/:id/events', {
    preHandler: enroll,
    schema: { tags: ['Contacts'], summary: 'Report an event the service cannot see: meeting_booked, opt_out, suppressed, reply', params: idParam, body: clientEventSchema, response: responses },
    handler: async (req, reply) => {
      const r = await reportClientEvent(ctx.deps, projectOf(req), req.params.id, req.body);
      return ok(reply, { signal: r.signal.id, created: r.created }, { status: r.created ? 201 : 200 });
    },
  });

  app.delete('/v1/contacts/:id', {
    preHandler: admin,
    schema: { tags: ['Contacts'], summary: 'Erase a contact and everything attached (privacy requests)', params: idParam, response: responses },
    handler: async (req, reply) => {
      await deleteContact(ctx.deps, projectOf(req), req.params.id);
      return ok(reply, { deleted: true });
    },
  });
}
