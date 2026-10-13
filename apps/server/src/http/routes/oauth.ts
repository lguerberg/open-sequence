/**
 * The Google OAuth return. Not called by clients: the sender's browser lands here after consent.
 * The auth module verifies the signed state, stores the refresh token, and we create the email
 * channel for that sender so the engine can send.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { setChannel } from '@opensequence/engine';
import type { AppContext } from '../context.js';

export const GOOGLE_CALLBACK_PATH = '/v1/oauth/google/callback';

export async function oauthRoutes(fastify: FastifyInstance, ctx: AppContext) {
  const query = z.object({ state: z.string().min(1), code: z.string().min(1).optional(), error: z.string().optional() });

  fastify.get(GOOGLE_CALLBACK_PATH, { schema: { hide: true } }, async (req, reply) => {
    const q = query.safeParse(req.query);
    reply.type('text/html');
    if (!q.success) return reply.status(400).send('<h1>Invalid request</h1>');
    if (q.data.error || !q.data.code) return reply.status(400).send(`<h1>Google did not grant access</h1><p>${q.data.error ?? 'no code'}. Close this window and try again.</p>`);
    try {
      const done = await ctx.auth.handleCallback({ state: q.data.state, code: q.data.code });
      // The connection belongs to a sender (ownerId); give that sender an active email channel at the Google address.
      await setChannel(ctx.deps, done.tenantId, done.ownerId, { channel: 'email', address: done.account, connectionId: done.connectionId, status: 'active' });
      if (done.returnUrl) return reply.redirect(done.returnUrl);
      return reply.send(`<h1>Google connected</h1><p>${done.account} can now send and read replies. You can close this window.</p>`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      req.log.warn({ err }, 'google callback failed');
      return reply.status(400).send(`<h1>Could not connect Google</h1><p>${message}</p>`);
    }
  });
}
