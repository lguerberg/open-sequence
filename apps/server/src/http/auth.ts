/**
 * Two kinds of callers (docs section 14): the operator (SEQ_ADMIN_TOKEN, /v1/admin/* only) and a
 * project API key with scopes (everything else). Each route declares what it needs; the hooks
 * resolve the caller once per request.
 */
import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { authenticateApiKey, requireScope, type AuthenticatedKey, type Deps, type Scope } from '@opensequence/engine';
import { fail } from './envelope.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthenticatedKey;
    operator?: boolean;
  }
}

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim() || null;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function requireOperator(adminToken: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const token = bearer(req);
    if (!token || !safeEqual(token, adminToken)) {
      return fail(reply, 401, { code: 'UNAUTHORIZED', message: 'This endpoint needs the operator token.' });
    }
    req.operator = true;
  };
}

export function requireProject(deps: Deps, scope: Scope) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const token = bearer(req);
    if (!token) return fail(reply, 401, { code: 'UNAUTHORIZED', message: 'Send a project API key as a Bearer token.' });
    const auth = await authenticateApiKey(deps, token);
    if (!auth) return fail(reply, 401, { code: 'UNAUTHORIZED', message: 'This API key is unknown or revoked.' });
    try {
      requireScope(auth, scope);
    } catch (e) {
      const err = e as { code: string; message: string; status?: number };
      return fail(reply, err.status ?? 403, { code: err.code, message: err.message });
    }
    req.auth = auth;
  };
}

export function projectOf(req: FastifyRequest): string {
  if (!req.auth) throw new Error('route is missing the project auth hook');
  return req.auth.projectId;
}
