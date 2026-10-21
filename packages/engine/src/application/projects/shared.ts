import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Project, ProjectSettings, Scope } from '../../domain/entities.js';
import { DomainError } from '../../domain/shared/errors.js';

export const SCOPES: readonly Scope[] = ['read', 'enroll', 'admin'];

export const UNSUBSCRIBE_TOKEN_PLACEHOLDER = '{token}';

export const unsubscribeUrlSchema = z
  .string()
  .max(2000)
  .refine((v) => v.includes(UNSUBSCRIBE_TOKEN_PLACEHOLDER), { message: 'must contain {token}, where the signed unsubscribe token goes, like https://app.example.com/u/{token}' })
  .refine(
    (v) => {
      try {
        const u = new URL(v.replaceAll(UNSUBSCRIBE_TOKEN_PLACEHOLDER, 'token'));
        return u.protocol === 'https:' && !!u.hostname;
      } catch {
        return false;
      }
    },
    { message: 'must be an https URL, like https://app.example.com/u/{token}' }
  );

/** The unsubscribe link for one token: the project's own page when set, else the page this server hosts. */
export function unsubscribeUrlFor(template: string | null | undefined, publicUrl: string, token: string): string {
  if (template) return template.replaceAll(UNSUBSCRIBE_TOKEN_PLACEHOLDER, encodeURIComponent(token));
  return `${publicUrl}/u/${token}`;
}

export const projectSettingsSchema = z
  .object({
    attribution_days: z.number().int().min(1).max(90).optional(),
    sms_countries: z.array(z.string().length(2)).optional(),
    send_window: z.object({ days: z.array(z.string()), from: z.string(), to: z.string(), tz: z.enum(['contact', 'sender']) }).optional(),
    attrs_schema: z.record(z.string(), z.object({ type: z.string(), label: z.string().optional(), values: z.array(z.string()).optional() })).optional(),
    retention_days: z.number().int().min(7).max(3650).optional(),
    store_inbound_bodies: z.boolean().optional(),
    match_replies_outside_thread: z.boolean().optional(),
    crm: z.object({ deal_selection: z.enum(['newest_open', 'highest_value', 'any_open']).optional() }).optional(),
    allo: z.object({ outcome_map: z.record(z.string(), z.string()).optional() }).optional(),
    max_steps_per_tick: z.number().int().min(1).max(10_000).optional(),
    mock: z.record(z.string(), z.unknown()).optional(),
    /**
     * Your own unsubscribe page, like `https://app.example.com/u/{token}`: an https URL with
     * `{token}` where the signed token goes. `{{ unsubscribe_url }}` and the List-Unsubscribe
     * headers use it; the page calls GET and POST /v1/unsubscribes/{token}. null goes back to
     * the page this server hosts.
     */
    unsubscribe_url: unsubscribeUrlSchema.nullable().optional(),
  })
  .strict();

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** 256 bits of entropy; a SHA-256 hash is enough to store it (no slow hash needed). */
export function newApiKeySecret(): string {
  return `sk_live_${randomBytes(32).toString('base64url')}`;
}

export interface AuthenticatedKey {
  projectId: string;
  keyId: string;
  scopes: Scope[];
}

export function requireScope(auth: AuthenticatedKey, scope: Scope): void {
  const rank: Record<Scope, number> = { read: 0, enroll: 1, admin: 2 };
  const have = Math.max(...auth.scopes.map((s) => rank[s] ?? -1));
  if (have < rank[scope]) throw new DomainError('INSUFFICIENT_SCOPE', `This key cannot do that; it needs the "${scope}" scope.`, 403);
}

export type EffectiveSettings = ProjectSettings &
  Required<Pick<ProjectSettings, 'attribution_days' | 'sms_countries' | 'retention_days' | 'store_inbound_bodies' | 'match_replies_outside_thread' | 'max_steps_per_tick'>>;

/** Settings with defaults applied, for the engine. */
export function effectiveSettings(p: Project): EffectiveSettings {
  return {
    attribution_days: 14,
    sms_countries: ['US'],
    retention_days: 365,
    store_inbound_bodies: false,
    match_replies_outside_thread: false,
    max_steps_per_tick: 500,
    ...p.settings,
  };
}

export function zodProblems(e: z.ZodError): string {
  return e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}
