/** The Fastify app: Zod type provider (routes are also the OpenAPI file), envelope errors, routes. */
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform, jsonSchemaTransformObject, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type pino from 'pino';
import type { Runtime } from '../bootstrap.js';
import { errorHandler } from './envelope.js';
import { adminRoutes } from './routes/admin.js';
import { analyticsRoutes } from './routes/analytics.js';
import { contactRoutes } from './routes/contacts.js';
import { enrollmentRoutes } from './routes/enrollments.js';
import { healthRoutes } from './routes/health.js';
import { hookRoutes } from './routes/hooks.js';
import { optOutRoutes } from './routes/optout.js';
import { unsubscribeRoutes } from './routes/unsubscribes.js';
import { projectRoutes } from './routes/project.js';
import { senderRoutes } from './routes/senders.js';
import { sequenceRoutes } from './routes/sequences.js';
import { taskRoutes } from './routes/tasks.js';
import { webhookRoutes } from './routes/webhooks.js';

type OpenApiLike = { components?: { schemas?: Record<string, unknown> } } & Record<string, unknown>;

/** Removes `components.schemas` entries that nothing in the document references (transitively). */
export function pruneUnreferencedComponents<T extends OpenApiLike>(doc: T): T {
  const schemas = doc.components?.schemas;
  if (!schemas) return doc;
  const refsIn = (value: unknown, out: Set<string>) => {
    JSON.stringify(value, (_k, v: unknown) => {
      if (typeof v === 'string' && v.startsWith('#/components/schemas/')) out.add(v.slice('#/components/schemas/'.length));
      return v;
    });
    return out;
  };
  const used = refsIn({ ...doc, components: { ...doc.components, schemas: undefined } }, new Set<string>());
  for (const queue = [...used]; queue.length; ) {
    const name = queue.pop()!;
    for (const ref of refsIn(schemas[name], new Set<string>())) {
      if (used.has(ref)) continue;
      used.add(ref);
      queue.push(ref);
    }
  }
  for (const name of Object.keys(schemas)) if (!used.has(name)) delete schemas[name];
  return doc;
}

export async function buildApp(rt: Runtime, log: pino.Logger) {
  const app = Fastify({
    loggerInstance: log,
    genReqId: () => `req_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
    // Unsubscribe tokens (/u/{token}, /v1/unsubscribes/{token}) are about 200 characters; the default cap is 100.
    routerOptions: { maxParamLength: 2048 },
  });
  // Fastify hands an absent body to the validator as `null`; Zod `.optional()` bodies expect `undefined`.
  app.setValidatorCompiler((routeSchema) => {
    const validate = validatorCompiler(routeSchema as Parameters<typeof validatorCompiler>[0]);
    return (data: unknown) => validate(routeSchema.httpPart === 'body' && data === null ? undefined : data);
  });
  app.setSerializerCompiler(serializerCompiler);
  // A POST with `content-type: application/json` and no body is common from curl and SDKs; treat it as no body.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (typeof body !== 'string' || body.trim() === '') return done(null, undefined);
    try {
      done(null, JSON.parse(body));
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      e.statusCode = 400;
      done(e, undefined);
    }
  });
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler((req, reply) => reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.url}.` }, meta: { request_id: req.id } }));

  await app.register(rateLimit, { max: 600, timeWindow: '1 minute', keyGenerator: (req) => req.headers.authorization ?? req.ip });

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'OpenSequence API', version: '0.1.0', description: 'A self-hosted service that runs multi-step outreach sequences for any CRM. https://opensequence.dev' },
      servers: [{ url: rt.env.SEQ_PUBLIC_URL }],
      components: { securitySchemes: { projectKey: { type: 'http', scheme: 'bearer', description: 'A project API key (sk_live_…) with read, enroll or admin scope.' }, operatorToken: { type: 'http', scheme: 'bearer', description: 'SEQ_ADMIN_TOKEN, for /v1/admin/* only.' } } },
      security: [{ projectKey: [] }],
    },
    transform: jsonSchemaTransform,
    // Named response schemas (responses.ts) become `components.schemas`. The type provider also emits an
    // `…Input` twin of every one, which no route references; drop those so the document only names what it uses.
    transformObject: (doc) => pruneUnreferencedComponents(jsonSchemaTransformObject(doc)),
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(async (api) => {
    await healthRoutes(api, rt);
    await adminRoutes(api, rt);
    await projectRoutes(api, rt);
    await senderRoutes(api, rt);
    await contactRoutes(api, rt);
    await sequenceRoutes(api, rt);
    await enrollmentRoutes(api, rt);
    await taskRoutes(api, rt);
    await webhookRoutes(api, rt);
    await analyticsRoutes(api, rt);
    await unsubscribeRoutes(api, rt);
    await optOutRoutes(api, rt);
  });
  // Hooks need the raw body for signatures, so they live in their own plugin with their own parsers.
  await app.register(async (hooks) => hookRoutes(hooks, rt));

  return app;
}
