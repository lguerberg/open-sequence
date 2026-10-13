/**
 * What the webhook use cases share: Standard Webhooks signing, the retry schedule, the endpoint
 * and delivery shapes the API returns (never the secret), and the SSRF check on endpoint URLs.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { z } from 'zod';
import type { WebhookDelivery, WebhookEndpoint } from '../../domain/entities.js';
import { EVENT_TYPES } from '../../domain/shared/events.js';
import { invalid } from '../../domain/shared/errors.js';

export const WEBHOOK_QUEUE = 'seq_webhooks';
export const DELIVERY_TIMEOUT_MS = 10_000;
/** An endpoint that has failed every delivery for this long is disabled (docs section 9.2). */
export const DISABLE_AFTER_MS = 3 * 24 * 60 * 60_000;

/** Delay before attempt n+1 after attempt n failed; past the end the delivery is failed for good. */
export const BACKOFF_MS: readonly number[] = [0, 5_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 5 * 3_600_000, 10 * 3_600_000, 10 * 3_600_000, 10 * 3_600_000];

// ------------------------------------------------------------------ secrets and signatures
const SECRET_PREFIX = 'whsec_';

export function newSecret(): string {
  return SECRET_PREFIX + randomBytes(32).toString('base64');
}

function secretBytes(secret: string): Buffer {
  return Buffer.from(secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret, 'base64');
}

/** Standard Webhooks: v1,base64(HMAC-SHA256(secret, `${id}.${timestamp}.${body}`)). */
export function sign(secret: string, id: string, timestampSeconds: number, body: string): string {
  const mac = createHmac('sha256', secretBytes(secret)).update(`${id}.${timestampSeconds}.${body}`).digest('base64');
  return `v1,${mac}`;
}

export function signedHeaders(secret: string, id: string, at: Date, body: string): Record<string, string> {
  const ts = Math.floor(at.getTime() / 1000);
  return {
    'content-type': 'application/json',
    'user-agent': 'OpenSequence-Webhooks/1',
    'webhook-id': id,
    'webhook-timestamp': String(ts),
    'webhook-signature': sign(secret, id, ts, body),
  };
}

// ------------------------------------------------------------------ input and output shapes
export const endpointInputSchema = z
  .object({
    url: z.string().url().max(2048),
    event_types: z.array(z.string().max(48)).min(1).max(EVENT_TYPES.length + 1).default(['*']),
  })
  .strict();
export type EndpointInput = z.input<typeof endpointInputSchema>;

export const endpointPatchSchema = endpointInputSchema.partial().strict();
export type EndpointPatch = z.input<typeof endpointPatchSchema>;

/** `*` alone, or a set of known event types. */
export function normalizeEventTypes(types: string[]): string[] {
  const unique = [...new Set(types)];
  if (unique.length === 1 && unique[0] === '*') return unique;
  const unknown = unique.filter((t) => !(EVENT_TYPES as readonly string[]).includes(t));
  if (unknown.length) throw invalid('UNKNOWN_EVENT_TYPE', `Unknown event type: ${unknown.join(', ')}. Use "*" or one of ${EVENT_TYPES.join(', ')}.`);
  return unique;
}

export function endpointPayload(e: WebhookEndpoint): Record<string, unknown> {
  return {
    id: e.id,
    url: e.url,
    event_types: e.eventTypes,
    status: e.status,
    disabled_reason: e.disabledReason,
    disabled_at: e.disabledAt?.toISOString() ?? null,
    created_at: e.createdAt.toISOString(),
    updated_at: e.updatedAt.toISOString(),
  };
}

export function deliveryPayload(d: WebhookDelivery): Record<string, unknown> {
  return {
    id: d.id,
    endpoint: d.endpointId,
    event_id: d.eventId,
    event_type: d.eventType,
    enrollment: d.enrollmentId,
    status: d.status,
    attempts: d.attempts,
    next_attempt_at: d.nextAttemptAt?.toISOString() ?? null,
    last_status_code: d.lastStatusCode,
    last_error: d.lastError,
    payload: d.payload,
    created_at: d.createdAt.toISOString(),
    delivered_at: d.deliveredAt?.toISOString() ?? null,
  };
}

// ------------------------------------------------------------------ SSRF
export type Resolver = (hostname: string) => Promise<string[]>;

const defaultResolver: Resolver = async (hostname) => (await dnsLookup(hostname, { all: true })).map((a) => a.address);

/** Why a URL may not be an endpoint, or null when it may. Resolves every address of the host. */
export async function unsafeUrlReason(url: string, resolve: Resolver = defaultResolver): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'not a valid URL';
  }
  if (parsed.protocol !== 'https:') return 'must use https';
  if (parsed.username || parsed.password) return 'must not carry credentials';
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return 'must not point at a local host';
  const addresses = isIP(host) ? [host] : await resolve(host).catch(() => []);
  if (addresses.length === 0) return 'host does not resolve';
  if (addresses.some(isPrivateAddress)) return 'must resolve to a public address';
  return null;
}

export async function isSafeUrl(url: string, resolve?: Resolver): Promise<boolean> {
  return (await unsafeUrlReason(url, resolve)) === null;
}

/** Loopback, private, link-local (incl. cloud metadata), CGNAT, multicast, reserved and unspecified ranges. */
export function isPrivateAddress(address: string): boolean {
  const v4 = toIPv4(address);
  if (v4) {
    const [a, b] = v4;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (isIP(address) !== 6) return true;
  const first = parseInt(address.split(':')[0] || '0', 16);
  if (address === '::' || address === '::1') return true;
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

/** The four octets of a dotted IPv4, of an IPv4-mapped IPv6 (::ffff:a.b.c.d) or of NAT64 (64:ff9b::a.b.c.d); null otherwise. */
function toIPv4(address: string): [number, number, number, number] | null {
  let text = address.toLowerCase();
  const mapped = /^(?:::ffff:|64:ff9b::)(.+)$/.exec(text);
  if (mapped) text = mapped[1]!;
  if (isIP(text) !== 4) {
    // hex-form mapped address, ::ffff:7f00:1
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(address.toLowerCase());
    if (!hex) return null;
    const hi = parseInt(hex[1]!, 16);
    const lo = parseInt(hex[2]!, 16);
    return [hi >> 8, hi & 255, lo >> 8, lo & 255];
  }
  const parts = text.split('.').map(Number);
  return [parts[0]!, parts[1]!, parts[2]!, parts[3]!];
}
