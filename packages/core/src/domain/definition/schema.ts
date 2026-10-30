/**
 * The sequence definition: one JSON document that holds the whole sequence.
 *
 * Only the parts every node shares live here. Node params and channel actions are contributed by
 * the registries (see ./registry.ts), so a new node type or channel never edits this file.
 */
import { z } from 'zod';
import { DURATION_PATTERN } from './duration.js';

export const SCHEMA_VERSION = 1;

export const nodeIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, 'node ids are lower_snake_case, like email_intro');

export const durationSchema = z
  .string()
  .regex(DURATION_PATTERN, 'a duration is a number followed by m, h, d or bd, like 2bd')
  .refine((s) => {
    const m = DURATION_PATTERN.exec(s);
    return m !== null && Number(m[1]) > 0;
  }, 'a duration must be positive');

export const weekdaySchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
export type Weekday = z.infer<typeof weekdaySchema>;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use HH:MM, 24-hour');

export const sendWindowSchema = z.object({
  days: z.array(weekdaySchema).min(1),
  from: hhmm,
  to: hhmm,
  /** Whose clock the window follows. */
  tz: z.enum(['contact', 'sender']).default('contact'),
});
export type SendWindow = z.infer<typeof sendWindowSchema>;

export const reenrollSchema = z
  .string()
  .regex(/^(never|always|after_\d+d)$/, 'reenroll is never, always or after_<n>d, like after_90d')
  .default('never');

export const settingsSchema = z.object({
  send_window: sendWindowSchema.optional(),
  jitter: durationSchema.optional(),
  reenroll: reenrollSchema,
});
export type Settings = z.infer<typeof settingsSchema>;

export const exitOnSchema = z.array(z.enum(['reply', 'meeting_booked'])).default([]);
export type ExitOn = z.infer<typeof exitOnSchema>;

/**
 * The shape every node shares. `params` and the allowed transition keys are validated by the
 * registry for the node's type (and, for outreach, its channel and action).
 */
export const nodeBaseSchema = z.object({
  type: z.string().min(1),
  name: z.string().max(120).optional(),
  channel: z.string().optional(),
  action: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  next: z.record(z.string(), nodeIdSchema).default({}),
  /** Task nodes only: an outcome string to a node id. */
  branches_by_outcome: z.record(z.string(), nodeIdSchema).optional(),
});
export type NodeBase = z.infer<typeof nodeBaseSchema>;

export const definitionSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  entry: nodeIdSchema,
  settings: settingsSchema.default({ reenroll: 'never' }),
  exit_on: exitOnSchema,
  nodes: z.record(nodeIdSchema, nodeBaseSchema).refine((n) => Object.keys(n).length > 0, 'a sequence needs at least one node'),
});
export type Definition = z.infer<typeof definitionSchema>;
export type DefinitionInput = z.input<typeof definitionSchema>;

/** Limits that protect the service; the validator reports them as INVALID_DEFINITION. */
export const DEFINITION_LIMITS = {
  maxNodes: 200,
  /** The definition as JSON. Large enough for a few HTML emails with embedded images. */
  maxBytes: 10 * 1024 * 1024,
  maxSmsChars: 1000,
  /** LinkedIn's cap on a connection note with Premium or Sales Navigator; free accounts get 200. */
  maxLinkedInNote: 300,
  maxLinkedInNoteFree: 200,
  /** An email body with `format: "text"`. */
  maxTextEmailChars: 100_000,
  /** An email body with `format: "html"`: room for a branded layout and a few embedded images. */
  maxHtmlEmailChars: 5_000_000,
} as const;
