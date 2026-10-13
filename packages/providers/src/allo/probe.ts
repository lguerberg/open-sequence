import { ALLO_BASE_URL, AlloApiError, AlloClient, unwrapData } from './client.js';
import { asString, isRecord } from '../http.js';

export const ALLO_REQUIRED_SCOPES = ['SMS_SEND', 'DIALING_QUEUE_READ_WRITE', 'PHONE_NUMBERS_READ', 'USERS_READ', 'WEBHOOKS_READ_WRITE', 'CONVERSATIONS_READ'] as const;

export const ALLO_WEBHOOK_TOPICS = ['sms.received', 'sms.sent', 'call.completed'] as const;

export interface AlloProbeResult {
  ok: boolean;
  scopes: string[];
  missing: string[];
  teamId?: string;
  /** Set when the key was rejected outright (401/403). */
  error?: string;
}

export function scopesOf(me: unknown): string[] {
  const data = unwrapData(me);
  const raw = isRecord(data) ? data.scopes : undefined;
  if (Array.isArray(raw)) return raw.map((scope) => (isRecord(scope) ? asString(scope.name) : asString(scope))).filter((s): s is string => !!s);
  return typeof raw === 'string' ? raw.split(/[\s,]+/).filter(Boolean) : [];
}

/** `GET /v2/api/me`: is the key valid and does it carry every scope the adapter needs? */
export async function alloProbe(apiKey: string, opts: { baseUrl?: string; fetch?: typeof fetch } = {}): Promise<AlloProbeResult> {
  const client = new AlloClient(apiKey, opts.baseUrl ?? ALLO_BASE_URL, opts.fetch ?? fetch);
  let me: unknown;
  try {
    me = await client.get('/v2/api/me');
  } catch (err) {
    if (err instanceof AlloApiError && (err.status === 401 || err.status === 403)) {
      return { ok: false, scopes: [], missing: [...ALLO_REQUIRED_SCOPES], error: err.message };
    }
    throw err;
  }
  const scopes = scopesOf(me);
  const missing = ALLO_REQUIRED_SCOPES.filter((scope) => !scopes.includes(scope));
  const data = unwrapData(me);
  const team = isRecord(data) && isRecord(data.team) ? data.team : undefined;
  const teamId = team ? asString(team.id) : undefined;
  return { ok: missing.length === 0, scopes, missing, ...(teamId ? { teamId } : {}) };
}

/** `POST /v2/api/webhooks`: registers our endpoint; the signing secret is returned only here. */
export async function alloRegisterWebhook(
  apiKey: string,
  url: string,
  topics: readonly string[] = ALLO_WEBHOOK_TOPICS,
  opts: { baseUrl?: string; fetch?: typeof fetch; description?: string } = {},
): Promise<{ id: string; signingSecret: string }> {
  const client = new AlloClient(apiKey, opts.baseUrl ?? ALLO_BASE_URL, opts.fetch ?? fetch);
  const res = unwrapData(await client.post('/v2/api/webhooks', { url, topics: [...topics], description: opts.description ?? 'OpenSequence' }));
  const id = isRecord(res) ? asString(res.id) : undefined;
  const signingSecret = isRecord(res) ? asString(res.signing_secret) : undefined;
  if (!id || !signingSecret) throw new Error('ALLO_WEBHOOK_REGISTRATION_INVALID: Allo did not return an id and a signing_secret');
  return { id, signingSecret };
}
