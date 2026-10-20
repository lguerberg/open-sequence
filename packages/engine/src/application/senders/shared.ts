import { z } from 'zod';
import { isValidTimezone } from '@opensequence/core';

export const senderInputSchema = z.object({
  name: z.string().min(1).max(160),
  email: z.string().email().max(320).optional().nullable(),
  timezone: z.string().max(48).refine(isValidTimezone, 'not an IANA time zone, like Europe/London').default('UTC'),
  attrs: z.record(z.string(), z.unknown()).default({}),
  /** The email signature as HTML; sanitized on save (see signature.ts). `null` clears it. */
  signature_html: z.string().max(20_000).optional().nullable(),
  /** The plain-text version, for `format: "text"` emails; derived from the HTML when omitted. */
  signature_text: z.string().max(4_000).optional().nullable(),
});
export type SenderInput = z.input<typeof senderInputSchema>;

export const channelPatchSchema = z
  .object({
    daily_limit: z.number().int().min(0).max(10_000).nullable().optional(),
    weekly_limit: z.number().int().min(0).max(100_000).nullable().optional(),
    min_gap_seconds: z.number().int().min(0).max(86_400).optional(),
    opted_in: z.boolean().optional(),
    status: z.enum(['active', 'paused']).optional(),
  })
  .strict();
export type ChannelPatch = z.input<typeof channelPatchSchema>;

/** Defaults a new channel starts with. */
export const CHANNEL_DEFAULTS: Record<string, { dailyLimit: number | null; minGapSeconds: number }> = {
  email: { dailyLimit: 30, minGapSeconds: 60 },
  sms: { dailyLimit: 100, minGapSeconds: 0 },
};

/** The mail adapter every email channel goes through (SMTP to send, IMAP to read), as recorded on messages and signals. */
export const EMAIL_PROVIDER = 'smtp';
