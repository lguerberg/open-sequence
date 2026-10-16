/** Request schemas shared by routes. Response bodies use the envelope with an open `data`. */
import { z } from 'zod';

export const idParam = z.object({ id: z.string().min(1).max(128) });
export const idAndVersionParams = z.object({ id: z.string().min(1).max(128), vid: z.string().min(1).max(128) });

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  updated_since: z.coerce.date().optional(),
});

export const okEnvelope = z.object({ success: z.literal(true), data: z.unknown(), meta: z.object({ request_id: z.string(), next_cursor: z.string().nullable().optional() }) });
export const errEnvelope = z.object({ success: z.literal(false), error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }), meta: z.object({ request_id: z.string() }) });
export const responses = { 200: okEnvelope, 201: okEnvelope, 400: errEnvelope, 401: errEnvelope, 403: errEnvelope, 404: errEnvelope, 409: errEnvelope, 422: errEnvelope, 429: errEnvelope, 500: errEnvelope } as const;

export const contactBody = z
  .object({
    first_name: z.string().max(120).nullable().optional(),
    last_name: z.string().max(120).nullable().optional(),
    email: z.string().email().max(320).nullable().optional(),
    phone: z.string().max(24).nullable().optional(),
    country: z.string().length(2).nullable().optional(),
    timezone: z.string().max(48).nullable().optional(),
    attrs: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const definitionBody = z.record(z.string(), z.unknown());