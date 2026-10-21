/** Sequences and versions: CRUD, drafts, publish, validate, simulate, schema. */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { definitionSchema, ensureBuiltins, registry, validateDefinition } from '@opensequence/core';
import { archiveVersion, createSequence, createSequenceSchema, deleteDraft, getVersion, newVersion, publishVersion, resolveSequence, saveDraft, updateSequence, EVENT_TYPES } from '@opensequence/engine';
import type { Version } from '@opensequence/engine';
import { projectOf, requireProject } from '../auth.js';
import type { AppContext } from '../context.js';
import { ok } from '../envelope.js';
import { createdResponse, createdSequence, deleted, eventTypes, listResponse, okResponse, schemaCatalogue, schemaFields, sequence, sequenceDetail, sequenceListItem, validationResult, version, versionWithProblems } from '../responses.js';
import { DEFINITION_BODY_LIMIT, definitionBody, idAndVersionParams, idParam, listQuerySchema } from '../schemas.js';

/** The version summary a sequence carries in lists and in its detail. */
const versionSummary = (v: Version) => ({ id: v.id, tag: v.tag, status: v.status, published_at: v.publishedAt, created_at: v.createdAt });

/** Every status, zero when no enrollment has it, so a client never has to default a missing key. */
const EMPTY_COUNTS = { active: 0, paused: 0, waiting_limit: 0, completed: 0, exited: 0, failed: 0 };

export async function sequenceRoutes(fastify: FastifyInstance, ctx: AppContext) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const admin = requireProject(ctx.deps, 'admin');
  const read = requireProject(ctx.deps, 'read');
  ensureBuiltins();

  app.get('/v1/sequences', {
    preHandler: read,
    schema: { tags: ['Sequences'], summary: 'List sequences with their versions and enrollment counts by status', querystring: listQuerySchema, response: listResponse(sequenceListItem) },
    handler: async (req, reply) => {
      const projectId = projectOf(req);
      const page = await ctx.deps.uow.repos.sequences.list(projectId, req.query);
      const items = [];
      for (const s of page.items) {
        const [versions, counts] = await Promise.all([ctx.deps.uow.repos.sequences.versions(s.id), ctx.deps.uow.repos.enrollments.countBySequence(s.id)]);
        items.push({ ...s, versions: versions.map(versionSummary), counts: { ...EMPTY_COUNTS, ...counts } });
      }
      return ok(reply, items, { next_cursor: page.nextCursor });
    },
  });

  app.post('/v1/sequences', {
    bodyLimit: DEFINITION_BODY_LIMIT,
    preHandler: admin,
    schema: { tags: ['Sequences'], summary: 'Create a sequence and its v1 draft', body: createSequenceSchema, response: createdResponse(createdSequence) },
    handler: async (req, reply) => ok(reply, await createSequence(ctx.deps, projectOf(req), req.body), { status: 201 }),
  });

  app.get('/v1/sequences/:id', {
    preHandler: read,
    schema: { tags: ['Sequences'], summary: 'A sequence with its versions', params: idParam, response: okResponse(sequenceDetail) },
    handler: async (req, reply) => {
      const s = await resolveSequence(ctx.deps, projectOf(req), req.params.id);
      const versions = await ctx.deps.uow.repos.sequences.versions(s.id);
      return ok(reply, { ...s, versions: versions.map(versionSummary) });
    },
  });

  app.patch('/v1/sequences/:id', {
    preHandler: admin,
    schema: {
      tags: ['Sequences'],
      summary: 'Rename, describe, pause or archive',
      params: idParam,
      body: z.object({ name: z.string().min(1).max(160).optional(), description: z.string().max(2000).nullable().optional(), labels: z.record(z.string(), z.unknown()).optional(), status: z.enum(['active', 'paused', 'archived']).optional(), exit_active: z.boolean().optional() }).strict(),
      response: okResponse(sequence),
    },
    handler: async (req, reply) => ok(reply, await updateSequence(ctx.deps, projectOf(req), req.params.id, req.body)),
  });

  app.get('/v1/sequences/:id/versions', {
    preHandler: read,
    schema: { tags: ['Sequences'], summary: 'Versions of a sequence', params: idParam, response: okResponse(z.array(version)) },
    handler: async (req, reply) => {
      const s = await resolveSequence(ctx.deps, projectOf(req), req.params.id);
      return ok(reply, await ctx.deps.uow.repos.sequences.versions(s.id));
    },
  });

  app.post('/v1/sequences/:id/versions', {
    preHandler: admin,
    schema: { tags: ['Sequences'], summary: 'Copy a version into a new draft', params: idParam, body: z.object({ from_version: z.string().optional(), tag: z.string().min(1).max(24), created_by: z.string().max(64).optional() }), response: createdResponse(version) },
    handler: async (req, reply) => {
      const s = await resolveSequence(ctx.deps, projectOf(req), req.params.id);
      return ok(reply, await newVersion(ctx.deps, projectOf(req), s.id, req.body), { status: 201 });
    },
  });

  app.get('/v1/sequences/:id/versions/:vid', {
    preHandler: read,
    schema: { tags: ['Sequences'], summary: 'A version: definition and validation problems', params: idAndVersionParams, response: okResponse(versionWithProblems) },
    handler: async (req, reply) => ok(reply, await getVersion(ctx.deps, projectOf(req), req.params.vid)),
  });

  app.put('/v1/sequences/:id/versions/:vid/draft', {
    bodyLimit: DEFINITION_BODY_LIMIT,
    preHandler: admin,
    schema: { tags: ['Sequences'], summary: 'Save a draft (optimistic lock)', params: idAndVersionParams, body: z.object({ definition: definitionBody, lock_version: z.number().int().min(0) }), response: okResponse(versionWithProblems) },
    handler: async (req, reply) => ok(reply, await saveDraft(ctx.deps, projectOf(req), req.params.vid, req.body)),
  });

  app.post('/v1/sequences/:id/versions/:vid/publish', {
    preHandler: admin,
    schema: { tags: ['Sequences'], summary: 'Validate (errors block), publish, make default', params: idAndVersionParams, body: z.object({ published_by: z.string().max(64).optional() }).optional(), response: okResponse(versionWithProblems) },
    handler: async (req, reply) => ok(reply, await publishVersion(ctx.deps, projectOf(req), req.params.vid, req.body?.published_by ?? req.auth?.keyId ?? null)),
  });

  app.post('/v1/sequences/:id/versions/:vid/archive', {
    preHandler: admin,
    schema: { tags: ['Sequences'], summary: 'Stop new enrollments into this version', params: idAndVersionParams, response: okResponse(version) },
    handler: async (req, reply) => ok(reply, await archiveVersion(ctx.deps, projectOf(req), req.params.vid)),
  });

  app.delete('/v1/sequences/:id/versions/:vid', {
    preHandler: admin,
    schema: { tags: ['Sequences'], summary: 'Delete a draft', params: idAndVersionParams, response: okResponse(deleted) },
    handler: async (req, reply) => {
      await deleteDraft(ctx.deps, projectOf(req), req.params.vid);
      return ok(reply, { deleted: true });
    },
  });

  app.post('/v1/sequences::validate', {
    bodyLimit: DEFINITION_BODY_LIMIT,
    preHandler: read,
    schema: { tags: ['Sequences'], summary: 'Validate a definition without saving', body: z.object({ definition: definitionBody }), response: okResponse(validationResult) },
    handler: async (req, reply) => {
      const r = validateDefinition(req.body.definition);
      return ok(reply, { ok: r.ok, problems: r.problems });
    },
  });

  app.get('/v1/schema', {
    preHandler: read,
    schema: { tags: ['Schema'], summary: 'JSON Schema of the definition plus the node and channel catalogue', response: okResponse(schemaCatalogue) },
    handler: async (_req, reply) => {
      const nodes = [...registry.nodes.values()].map((n) => ({ type: n.type, label: n.label, transitions: n.transitions, params: z.toJSONSchema(n.params) }));
      const channels = [...registry.channels.values()].map((c) => ({ name: c.name, label: c.label, actions: Object.values(c.actions).map((a) => ({ action: a.action, label: a.label, transitions: a.transitions, touch: a.touch, params: z.toJSONSchema(a.params) })) }));
      return ok(reply, { definition: z.toJSONSchema(definitionSchema), nodes, channels });
    },
  });

  app.get('/v1/schema/fields', {
    preHandler: read,
    schema: { tags: ['Schema'], summary: 'Condition fields: the registry plus the project attrs_schema', response: okResponse(schemaFields) },
    handler: async (req, reply) => {
      const project = await ctx.deps.uow.repos.projects.byId(projectOf(req));
      const sources = [...registry.facts.values()].map((s) => ({ prefix: s.prefix, label: s.label, open: s.open ?? false, fields: s.fields }));
      const attrs = Object.entries(project?.settings.attrs_schema ?? {}).map(([k, v]) => ({ field: `attrs.${k}`, label: v.label ?? k, type: v.type, values: v.values }));
      return ok(reply, { sources, attrs });
    },
  });

  app.get('/v1/schema/events', {
    preHandler: read,
    schema: { tags: ['Schema'], summary: 'The webhook event catalogue', response: okResponse(eventTypes) },
    handler: async (_req, reply) => ok(reply, EVENT_TYPES),
  });
}
