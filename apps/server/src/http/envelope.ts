/**
 * Every response is { success, data?, error?, meta } (docs section 10). Domain errors carry their
 * own code and HTTP status; anything else is a 500 with a request id to search the logs for.
 */
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { z } from 'zod';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export const errorEnvelope = z.object({
  success: z.literal(false),
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
  meta: z.object({ request_id: z.string() }),
});

export function ok<T>(reply: FastifyReply, data: T, extra: { next_cursor?: string | null; status?: number } = {}) {
  const meta: Record<string, unknown> = { request_id: reply.request.id };
  if (extra.next_cursor !== undefined) meta['next_cursor'] = extra.next_cursor;
  return reply.status(extra.status ?? 200).send({ success: true, data, meta });
}

export function fail(reply: FastifyReply, status: number, error: ApiError) {
  return reply.status(status).send({ success: false, error, meta: { request_id: reply.request.id } });
}

interface DomainLike {
  code: string;
  status?: number;
  details?: unknown;
  message: string;
}

const isDomainLike = (e: unknown): e is DomainLike => typeof e === 'object' && e !== null && typeof (e as DomainLike).code === 'string' && typeof (e as DomainLike).message === 'string';

export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  if (hasZodFastifySchemaValidationErrors(error)) {
    return fail(reply, 400, {
      code: 'VALIDATION_ERROR',
      message: 'The request did not match the schema.',
      details: error.validation.map((v) => ({ path: v.instancePath || v.params?.['issue'] ? String((v.params as { issue?: { path?: unknown[] } }).issue?.path?.join('.') ?? '') : '', message: v.message })),
    });
  }
  if (isDomainLike(error) && error.status && error.status < 500) {
    return fail(reply, error.status, { code: error.code, message: error.message, details: error.details });
  }
  const fe = error as FastifyError;
  if (fe.statusCode && fe.statusCode < 500) {
    return fail(reply, fe.statusCode, { code: fe.code ?? 'REQUEST_ERROR', message: fe.message });
  }
  request.log.error({ err: error }, 'unhandled error');
  return fail(reply, 500, { code: 'INTERNAL_ERROR', message: `Something went wrong on our side. Reference ${request.id}.` });
}
