/**
 * The hosted opt-out page, used when the project has no `unsubscribe_url` of its own: GET shows a
 * one-click page, POST (List-Unsubscribe-Post and the page's button) writes an email suppression
 * and exits the enrollment. The token is signed and expires. Projects that host their own page
 * call GET and POST /v1/unsubscribes/{token} instead (routes/unsubscribes.ts); both apply the same use case.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { applyUnsubscribe, DomainError, getUnsubscribe, type OptOutClaims } from '@opensequence/engine';
import type { AppContext } from '../context.js';

export type OptOutToken = OptOutClaims;

export function signOptOutToken(secret: string, t: OptOutToken): string {
  const body = Buffer.from(JSON.stringify(t)).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/** Null when the token is not ours or is malformed; otherwise its claims and whether it has expired. */
export function verifyOptOutToken(secret: string, token: string, now: Date): { claims: OptOutToken; expired: boolean } | null {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const t = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OptOutToken;
    if (!t.projectId || !t.contactId || typeof t.exp !== 'number') return null;
    return { claims: t, expired: t.exp * 1000 < now.getTime() };
  } catch {
    return null;
  }
}

const page = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:10vh auto;padding:0 1rem;color:#222}button{font:inherit;padding:.6rem 1.2rem;border-radius:.5rem;border:1px solid #222;background:#fff;cursor:pointer}</style><h1>${title}</h1>${body}`;

const expiredPage = () => page('This link has expired', '<p>Please reply to the email instead and we will remove you.</p>');

export async function optOutRoutes(fastify: FastifyInstance, ctx: AppContext) {
  fastify.get<{ Params: { token: string } }>('/u/:token', { schema: { hide: true } }, async (req, reply) => {
    const status = await getUnsubscribe(ctx.deps, req.params.token);
    reply.type('text/html');
    if (!status.valid) return reply.status(400).send(expiredPage());
    return reply.send(page('Unsubscribe', `<p>Click below and you will not receive further emails from this sender.</p><form method="post"><button type="submit">Unsubscribe</button></form>`));
  });

  fastify.post<{ Params: { token: string } }>('/u/:token', { schema: { hide: true } }, async (req, reply) => {
    reply.type('text/html');
    try {
      await applyUnsubscribe(ctx.deps, req.params.token);
    } catch (err) {
      if (err instanceof DomainError && err.status === 400) return reply.status(400).send(expiredPage());
      throw err;
    }
    return reply.send(page('You are unsubscribed', '<p>You will not receive further emails from this sender.</p>'));
  });
}
