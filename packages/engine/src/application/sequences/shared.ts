import { z } from 'zod';
import { SCHEMA_VERSION } from '@opensequence/core';

/** What a new sequence starts with: a start that goes straight to an end. */
export const emptyDraft = (): Record<string, unknown> => ({
  schema_version: SCHEMA_VERSION,
  entry: 'start',
  settings: { reenroll: 'never' },
  exit_on: ['reply', 'meeting_booked'],
  nodes: { start: { type: 'start', next: { then: 'end' } }, end: { type: 'end' } },
});

export const createSequenceSchema = z
  .object({
    name: z.string().min(1).max(160),
    description: z.string().max(2000).optional(),
    external_id: z.string().max(64).optional(),
    created_by: z.string().max(64).optional(),
    labels: z.record(z.string(), z.unknown()).optional(),
    definition: z.unknown().optional(),
  })
  .strict();
export type CreateSequenceInput = z.input<typeof createSequenceSchema>;

export const TAG_PATTERN = /^[A-Za-z0-9][\w.-]{0,23}$/;
