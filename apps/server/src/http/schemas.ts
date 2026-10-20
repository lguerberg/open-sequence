/** Request schemas shared by routes. Response schemas, with the envelope, live in responses.ts. */
import { z } from 'zod';

export const idParam = z.object({ id: z.string().min(1).max(128) });
export const idAndVersionParams = z.object({ id: z.string().min(1).max(128), vid: z.string().min(1).max(128) });

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  updated_since: z.coerce.date().optional(),
});

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
