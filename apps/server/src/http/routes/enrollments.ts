/** Enrollments: preview, enroll (409 ALREADY_IN_SEQUENCE), list, journey, pause, resume, exit. */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { enrollContacts, exitEnrollment, getJourney, pauseEnrollment, resumeEnrollment } from '@opensequence/engine';
import { projectOf, requireProject } from '../auth.js';
import type { AppContext } from '../context.js';
import { ok } from '../envelope.js';
import { createdResponse, enrollPreview, enrollResult, enrollment, enrollmentListItem, exited, journey, listResponse, okResponse } from '../responses.js';
import { contactBody, idParam, listQuerySchema } from '../schemas.js';

const enrollBody = z.object({
  contacts: z.array(z.union([z.string().min(1), contactBody.extend({ external_id: z.string().min(1).max(64) })])).min(1).max(5000),
  sender: z.string().min(1),
  version: z.string().optional(),
  enrolled_by: z.string().max(64).optional(),
  enrolled_by_kind: z.enum(['user', 'agent', 'system']).optional(),
  mode: z.enum(['live', 'dry_run']).optional(),
});

export async function enrollmentRoutes(fastify: FastifyInstance, ctx: AppContext) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const admin = requireProject(ctx.deps, 'admin');
  const enroll = requireProject(ctx.deps, 'enroll');
  const read = requireProject(ctx.deps, 'read');

  app.post('/v1/sequences/:id/enrollments::preview', {
    preHandler: read,
    schema: { tags: ['Enrollments'], summary: 'Preflight: conflicts, exclusions, capacity; no writes', params: idParam, body: enrollBody, response: okResponse(enrollPreview) },
    handler: async (req, reply) => {
      const { enrollments, ...preview } = await enrollContacts(ctx.deps, projectOf(req), req.params.id, req.body, { preview: true });
      void enrollments; // a preview writes nothing, so there is nothing to return here
      return ok(reply, preview);
    },
  });

  app.post('/v1/sequences/:id/enrollments', {
    preHandler: enroll,
    schema: { tags: ['Enrollments'], summary: 'Enroll contacts (all-or-nothing on ALREADY_IN_SEQUENCE)', params: idParam, body: enrollBody, response: createdResponse(enrollResult) },
    handler: async (req, reply) => {
      const body = { ...req.body, enrolled_by: req.body.enrolled_by ?? req.auth?.keyId };
      const result = await enrollContacts(ctx.deps, projectOf(req), req.params.id, body, { preview: false });
      return ok(reply, { ...result, enrollments: result.enrollments.map((e) => ({ id: e.id, contact: e.contactId, status: e.status, next_run_at: e.nextRunAt })) }, { status: 201 });
    },
  });

  app.get('/v1/enrollments', {
    preHandler: read,
    schema: {
      tags: ['Enrollments'],
      summary: 'List enrollments with the contact summary',
      querystring: listQuerySchema.extend({ sequence: z.string().optional(), version: z.string().optional(), status: z.string().optional(), sender: z.string().optional(), contact: z.string().optional(), exit_reason: z.string().optional() }),
      response: listResponse(enrollmentListItem),
    },
    handler: async (req, reply) => {
      const projectId = projectOf(req);
      const { sequence, version, status, sender, contact, exit_reason, ...opts } = req.query;
      const page = await ctx.deps.uow.repos.enrollments.list(projectId, { sequenceId: sequence, versionId: version, status, senderId: sender, contactId: contact, exitReason: exit_reason }, opts);
      const contacts = await ctx.deps.uow.repos.contacts.byIds(projectId, [...new Set(page.items.map((e) => e.contactId))]);
      const byId = new Map(contacts.map((c) => [c.id, c]));
      const items = page.items.map((e) => {
        const c = byId.get(e.contactId);
        return { ...e, contact: c ? { id: c.id, external_id: c.externalId, name: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email, email: c.email } : null };
      });
      return ok(reply, items, { next_cursor: page.nextCursor });
    },
  });

  app.get('/v1/enrollments/:id', {
    preHandler: read,
    schema: { tags: ['Enrollments'], summary: 'The journey: definition, runs with facts, messages, signals, tasks', params: idParam, response: okResponse(journey) },
    handler: async (req, reply) => ok(reply, await getJourney(ctx.deps, projectOf(req), req.params.id)),
  });

  app.post('/v1/enrollments/:id/pause', {
    preHandler: enroll,
    schema: { tags: ['Enrollments'], summary: 'Pause', params: idParam, body: z.object({ reason: z.string().max(40).optional(), until: z.coerce.date().optional() }).optional(), response: okResponse(enrollment) },
    handler: async (req, reply) => ok(reply, await pauseEnrollment(ctx.deps, projectOf(req), req.params.id, req.body ?? {})),
  });

  app.post('/v1/enrollments/:id/resume', {
    preHandler: enroll,
    schema: { tags: ['Enrollments'], summary: 'Resume', params: idParam, response: okResponse(enrollment) },
    handler: async (req, reply) => ok(reply, await resumeEnrollment(ctx.deps, projectOf(req), req.params.id)),
  });

  app.post('/v1/enrollments/:id/exit', {
    preHandler: admin,
    schema: { tags: ['Enrollments'], summary: 'Exit with reason manual and your label', params: idParam, body: z.object({ reason: z.string().max(40).optional(), label: z.string().max(120).optional() }).optional(), response: okResponse(enrollment) },
    handler: async (req, reply) => ok(reply, await exitEnrollment(ctx.deps, projectOf(req), req.params.id, req.body ?? {})),
  });

  app.post('/v1/enrollments::exit', {
    preHandler: admin,
    schema: { tags: ['Enrollments'], summary: 'Exit by selector: a contact, or a sequence and status', body: z.object({ contact: z.string().optional(), sequence: z.string().optional(), status: z.string().optional(), label: z.string().max(120).optional() }), response: okResponse(exited) },
    handler: async (req, reply) => {
      const projectId = projectOf(req);
      const repos = ctx.deps.uow.repos;
      let ids: string[] = [];
      if (req.body.contact) {
        const c = await repos.contacts.byExternalId(projectId, req.body.contact) ?? (await repos.contacts.byId(projectId, req.body.contact));
        if (c) ids = (await repos.enrollments.activeByContacts(projectId, [c.id])).map((e) => e.enrollmentId);
      } else if (req.body.sequence) {
        const page = await repos.enrollments.list(projectId, { sequenceId: req.body.sequence, status: req.body.status ?? 'active' }, { limit: 200 });
        ids = page.items.map((e) => e.id);
      }
      for (const id of ids) await exitEnrollment(ctx.deps, projectId, id, { label: req.body.label });
      return ok(reply, { exited: ids.length });
    },
  });
}
