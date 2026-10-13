import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import type { AppContext } from '../context.js';

export interface HealthState {
  /** Set by the worker's scheduler on every job run; readiness for the worker role needs a recent one. */
  lastJobAt: Date | null;
  migrated: boolean;
}

export const healthState: HealthState = { lastJobAt: null, migrated: false };

export async function healthRoutes(app: FastifyInstance, ctx: AppContext & { db: { execute(q: unknown): Promise<unknown> } }) {
  app.get('/healthz', { schema: { hide: true } }, async () => ({ ok: true }));

  app.get('/readyz', { schema: { hide: true } }, async (_req, reply) => {
    try {
      await ctx.db.execute(sql`select 1`);
    } catch {
      return reply.status(503).send({ ok: false, reason: 'database unreachable' });
    }
    if (!healthState.migrated) return reply.status(503).send({ ok: false, reason: 'migrations pending' });
    if (ctx.env.SEQ_ROLES !== 'api') {
      const age = healthState.lastJobAt ? Date.now() - healthState.lastJobAt.getTime() : Infinity;
      if (age > 2 * 60_000) return reply.status(503).send({ ok: false, reason: 'scheduler has not run a job in the last 2 minutes' });
    }
    return { ok: true };
  });
}
