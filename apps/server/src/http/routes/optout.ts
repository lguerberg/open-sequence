/**
 * The hosted opt-out link: GET shows a one-click page, POST (List-Unsubscribe-Post) and the page's
 * button write an email suppression and exit the enrollment. The token is signed and expires.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { recordSignal } from '@opensequence/engine';
import type { AppContext } from '../context.js';

export interface OptOutToken {
  projectId: string;
  contactId: string;
  runId: string;
  exp: number;
}

export function signOptOutToken(secret: string, t: OptOutToken): string {
  const body = Buffer.from(JSON.stringify(t)).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyOptOutToken(secret: string, token: string, now: Date): OptOutToken | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const t = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OptOutToken;
    if (!t.projectId || !t.contactId || typeof t.exp !== 'number' || t.exp * 1000 < now.getTime()) return null;
    return t;
  } catch {
    return null;
  }
}

const page = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:10vh auto;padding:0 1rem;color:#222}button{font:inherit;padding:.6rem 1.2rem;border-radius:.5rem;border:1px solid #222;background:#fff;cursor:pointer}</style><h1>${title}</h1>${body}`;

export async function optOutRoutes(fastify: FastifyInstance, ctx: AppContext & { optOutSecret: string }) {
  const apply = async (token: string) => {
    const t = verifyOptOutToken(ctx.optOutSecret, token, ctx.deps.clock.now());
    if (!t) return false;
    await ctx.deps.uow.transaction((scope) =>
      recordSignal(ctx.deps, scope, { projectId: t.projectId, contactId: t.contactId, kind: 'opt_out', channel: 'email', source: 'optout_link', externalId: `optout:${t.contactId}`, occurredAt: ctx.deps.clock.now(), payload: { run_id: t.runId } })
    );
    return true;
  };

  fastify.get<{ Params: { token: string } }>('/u/:token', { schema: { hide: true } }, async (req, reply) => {
    const ok = verifyOptOutToken(ctx.optOutSecret, req.params.token, ctx.deps.clock.now());
    reply.type('text/html');
    if (!ok) return reply.status(400).send(page('This link has expired', '<p>Please reply to the email instead and we will remove you.</p>'));
    return reply.send(page('Unsubscribe', `<p>Click below and you will not receive further emails from this sender.</p><form method="post"><button type="submit">Unsubscribe</button></form>`));
  });

  fastify.post<{ Params: { token: string } }>('/u/:token', { schema: { hide: true } }, async (req, reply) => {
    const ok = await apply(req.params.token);
    reply.type('text/html');
    if (!ok) return reply.status(400).send(page('This link has expired', '<p>Please reply to the email instead and we will remove you.</p>'));
    return reply.send(page('You are unsubscribed', '<p>You will not receive further emails from this sender.</p>'));
  });
}
