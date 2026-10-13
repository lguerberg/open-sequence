import { z } from 'zod';
import { parsePhoneNumber } from 'libphonenumber-js';
import { isValidTimezone } from '@opensequence/core';

const e164 = z
  .string()
  .max(24)
  .transform((s, ctx) => {
    try {
      const p = parsePhoneNumber(s);
      if (!p?.isValid()) throw new Error();
      return p.number as string;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'phone must be a valid E.164 number, like +14155551234' });
      return z.NEVER;
    }
  });

export const contactInputSchema = z
  .object({
    first_name: z.string().max(120).nullable().optional(),
    last_name: z.string().max(120).nullable().optional(),
    email: z.string().email().max(320).nullable().optional(),
    phone: e164.nullable().optional(),
    linkedin_url: z.string().url().max(2000).nullable().optional(),
    country: z.string().length(2).toUpperCase().nullable().optional(),
    timezone: z.string().max(48).refine(isValidTimezone, 'not an IANA time zone').nullable().optional(),
    attrs: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type ContactInput = z.input<typeof contactInputSchema>;
export type ParsedContactInput = z.output<typeof contactInputSchema>;

export const MAX_BATCH = 500;
