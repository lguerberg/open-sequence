/**
 * Inbound provider webhooks: not part of the client API. Always 2xx once accepted; idempotent by the
 * provider's event id (the signal table's unique key). The raw body is needed for signatures, so
 * these routes use a raw-body parser.
 */
import type { FastifyInstance } from 'fastify';
import { ingestInboundEvents } from '@opensequence/engine';
import { parseInboundEvent } from '@opensequence/providers';
import type { AppContext } from '../context.js';

export async function hookRoutes(fastify: FastifyInstance, ctx: AppContext) {
  // Signatures need the raw bytes: in this encapsulated plugin every content type is kept as a Buffer.
  fastify.removeAllContentTypeParsers();
  fastify.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

  const projectBySlug = async (slug: string) => ctx.deps.uow.repos.projects.bySlug(slug);

  fastify.post<{ Params: { slug: string } }>('/hooks/allo/:slug', { schema: { hide: true } }, async (req, reply) => {
    const project = await projectBySlug(req.params.slug);
    if (!project) return reply.status(404).send({ ok: false });
    const raw = req.body as Buffer;
    try {
      const creds = await ctx.auth.credentialsFor(project.id, 'allo');
      const secret = creds['webhook_secret'];
      if (!secret) return reply.status(401).send({ ok: false, reason: 'no webhook secret registered' });
      const events = await ctx.deps.providers.sms.verifyWebhook({ projectId: project.id, headers: req.headers, rawBody: raw, secret });
      const counts = await ingestInboundEvents(ctx.deps, project.id, 'allo', events);
      req.log.info({ projectId: project.id, ...counts }, 'allo webhook ingested');
      return reply.status(200).send({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/signature|timestamp/i.test(message)) return reply.status(401).send({ ok: false });
      req.log.error({ err, projectId: project.id }, 'allo webhook failed');
      return reply.status(200).send({ ok: true, deferred: true }); // never let Allo disable the endpoint over our bug
    }
  });


  if (ctx.mock) {
    const mock = ctx.mock;
    fastify.post<{ Params: { slug: string } }>('/hooks/mock/:slug', { schema: { hide: true } }, async (req, reply) => {
      const project = await projectBySlug(req.params.slug);
      if (!project) return reply.status(404).send({ ok: false });
      const events = parseInboundEvent(req.body as Buffer);
      for (const e of events) mock.push(project.id, e);
      const counts = await ingestInboundEvents(ctx.deps, project.id, 'mock', events);
      return reply.status(200).send({ ok: true, ...counts });
    });
  }
}
