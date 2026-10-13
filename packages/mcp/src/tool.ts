/**
 * What a tool is, independent of the MCP SDK: a name, a description an agent can read, a Zod
 * input shape, whether it changes state, and a `run` that returns a one-line summary plus the
 * JSON the API gave back. `server.ts` turns these into MCP tool registrations.
 */
import type { OpenSequence } from '@opensequence/sdk';
import { z } from 'zod';

/** `read` needs the `read` scope; `enroll` and `admin` change state and need that scope on the key. */
export type ToolScope = 'read' | 'enroll' | 'admin';

export interface ToolOutput {
  /** One or two plain-English lines an agent can read without parsing the JSON. */
  summary: string;
  /** The API's response, returned as a second JSON content block. */
  data: unknown;
}

export interface ToolDefinition<Shape extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  /** A short human title for clients that show one. */
  title: string;
  description: string;
  scope: ToolScope;
  input: Shape;
  /** Hints for the client: a write that only adds is not destructive; a repeatable write is idempotent. */
  hints?: { destructive?: boolean; idempotent?: boolean };
  run(client: OpenSequence, args: z.infer<z.ZodObject<Shape>>): Promise<ToolOutput>;
}

/** Identity helper that keeps the shape's inference while the tool goes into a plain list. */
export function defineTool<Shape extends z.ZodRawShape>(
  tool: ToolDefinition<Shape>
): ToolDefinition<Shape> {
  return tool;
}

export function isWrite(tool: ToolDefinition): boolean {
  return tool.scope !== 'read';
}

/** A refusal the MCP server makes itself, before or after calling the API (a version tag that does not exist). */
export class ToolError extends Error {
  override readonly name = 'ToolError';
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
  }
}

// ------------------------------------------------------------------ shared input fields

/** A sender, contact or sequence: the service id or the external id you gave it. */
export const ref = (what: string, serviceId: string, externalId: string) =>
  z
    .string()
    .min(1)
    .describe(
      `The ${what}: its service id ("${serviceId}") or the external id your app gave it ("${externalId}").`
    );

export const paging = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe('How many to return (1 to 200, default 50).'),
  cursor: z.string().optional().describe('The cursor a previous call returned, for the next page.'),
};

export const updatedSince = z
  .string()
  .optional()
  .describe('Only items changed at or after this ISO-8601 date-time.');

/** The filters every analytics endpoint takes. */
export const analyticsFilters = {
  version: z
    .string()
    .optional()
    .describe('Only this version: a version id (ver_…) or its tag (v2).'),
  from: z.string().optional().describe('Start of the period, ISO-8601 date or date-time.'),
  to: z.string().optional().describe('End of the period, ISO-8601 date or date-time.'),
  sender: z.string().optional().describe('Only this sender: service id or external id.'),
  country: z
    .string()
    .length(2)
    .optional()
    .describe("Only contacts in this country, two-letter ISO code (e.g. 'GB')."),
};

// ------------------------------------------------------------------ id resolution

const SERVICE_ID = /^(snd|ctc|seq|ver)_[0-9A-HJKMNP-TV-Z]{26}$/;

/** True for a service id of that kind (`snd_…`); false for an external id or the `ext:` form. */
export function isServiceId(value: string, prefix: 'snd' | 'ctc' | 'seq' | 'ver'): boolean {
  return SERVICE_ID.test(value) && value.startsWith(`${prefix}_`);
}

/**
 * List and analytics filters take service ids only, while paths take either. These turn an
 * external id into the service id with one read, so an agent can always use the ids it knows.
 */
export async function senderId(
  client: OpenSequence,
  value: string | undefined
): Promise<string | undefined> {
  if (value === undefined || isServiceId(value, 'snd')) return value;
  return (await client.senders.get(value)).id;
}

export async function contactId(
  client: OpenSequence,
  value: string | undefined
): Promise<string | undefined> {
  if (value === undefined || isServiceId(value, 'ctc')) return value;
  return (await client.contacts.get(value)).id;
}

export async function sequenceId(
  client: OpenSequence,
  value: string | undefined
): Promise<string | undefined> {
  if (value === undefined || isServiceId(value, 'seq')) return value;
  return (await client.sequences.get(value)).id;
}

/** A version id as given, or the id of the version with that tag in the sequence. */
export async function versionId(
  client: OpenSequence,
  sequence: string,
  version: string | undefined
): Promise<string | undefined> {
  if (version === undefined || isServiceId(version, 'ver')) return version;
  const detail = await client.sequences.get(sequence);
  const match = detail.versions.find((v) => v.tag === version);
  if (!match) {
    const tags = detail.versions.map((v) => v.tag).join(', ') || 'none';
    throw new ToolError(
      'VERSION_NOT_FOUND',
      `Sequence "${detail.name}" has no version "${version}". Its versions: ${tags}.`
    );
  }
  return match.id;
}

// ------------------------------------------------------------------ formatting

/** `3 contacts`, `1 contact`. */
export function count(n: number, noun: string, plural = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : plural}`;
}

/** Strips undefined values so the SDK sends only what the agent set. */
export function compact<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

/** A person's display name: first and last, else email, else the fallback. */
export function personName(
  p:
    | { firstName?: string | null; lastName?: string | null; email?: string | null }
    | null
    | undefined,
  fallback = 'someone'
): string {
  if (!p) return fallback;
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email || fallback;
}

/** `2026-10-14 09:00 UTC` from an ISO string; the input unchanged when it is not one. */
export function when(iso: string | null | undefined): string {
  if (!iso) return 'not scheduled';
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return m ? `${m[1]} ${m[2]} UTC` : iso;
}

/** Bulleted lines, capped so a summary stays short; the JSON block has the rest. */
export function bullets(lines: string[], max = 10): string {
  if (lines.length === 0) return '';
  const shown = lines.slice(0, max).map((l) => `- ${l}`);
  if (lines.length > max) shown.push(`- …and ${lines.length - max} more (see the JSON).`);
  return shown.join('\n');
}

/** The pagination hint, as the last line of a list summary. */
export function nextPage(cursor: string | null): string {
  return cursor ? `More results: call again with cursor "${cursor}".` : '';
}

/** Joins non-empty parts with newlines. */
export function lines(...parts: Array<string | false | null | undefined>): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join('\n');
}
