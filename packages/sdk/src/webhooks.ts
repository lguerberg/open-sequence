/**
 * Standard Webhooks verification, matching the service's signer exactly:
 * `webhook-signature: v1,base64(HMAC-SHA256(secret, `${webhook-id}.${webhook-timestamp}.${raw body}`))`,
 * the secret being the base64 after `whsec_`; several space-separated signatures during a rotation;
 * timestamps older (or newer) than the tolerance are rejected.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { WebhookEvent } from './types.js';

const SECRET_PREFIX = 'whsec_';
export const DEFAULT_TOLERANCE_SECONDS = 300;

export type HeaderLike = Record<string, string | string[] | undefined> | { get(name: string): string | null };

export interface VerifyWebhookInput {
  /** The endpoint secret from `oseq.webhooks.create()` or `rotateSecret()`; during a rotation pass both, old and new. */
  secret: string | string[];
  /** The request headers (a plain object as Node gives them, or a Fetch `Headers`). */
  headers: HeaderLike;
  /** The raw request body, exactly as received. A parsed and re-serialized body will not verify. */
  body: string | Uint8Array;
  /** Maximum age of `webhook-timestamp`, in seconds. Default 300. */
  toleranceSeconds?: number;
  /** Injected clock for tests. */
  now?: Date;
}

export class WebhookVerificationError extends Error {
  override readonly name = 'WebhookVerificationError';
  constructor(
    readonly code: 'MISSING_HEADERS' | 'BAD_TIMESTAMP' | 'TIMESTAMP_OUT_OF_TOLERANCE' | 'NO_MATCHING_SIGNATURE' | 'INVALID_BODY',
    message: string,
  ) {
    super(message);
  }
}

function header(headers: HeaderLike, name: string): string | undefined {
  if (typeof (headers as { get?: unknown }).get === 'function') {
    return (headers as { get(name: string): string | null }).get(name) ?? undefined;
  }
  const record = headers as Record<string, string | string[] | undefined>;
  const value = record[name] ?? record[name.toLowerCase()] ?? Object.entries(record).find(([k]) => k.toLowerCase() === name)?.[1];
  return Array.isArray(value) ? value[0] : value;
}

function secretBytes(secret: string): Buffer {
  return Buffer.from(secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret, 'base64');
}

/** The `v1,…` value the service sends for this id, timestamp and body. Exported for tests and for signing your own test events. */
export function signWebhook(secret: string, id: string, timestampSeconds: number, body: string | Uint8Array): string {
  const mac = createHmac('sha256', secretBytes(secret)).update(`${id}.${timestampSeconds}.`).update(body).digest('base64');
  return `v1,${mac}`;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Verifies the signature and the timestamp, then returns the parsed event. Throws
 * WebhookVerificationError otherwise; respond with a 4xx and the service retries nothing for that
 * delivery until you replay it.
 */
export function verifyWebhook<T = Record<string, unknown>>(input: VerifyWebhookInput): WebhookEvent<T> {
  const id = header(input.headers, 'webhook-id');
  const timestamp = header(input.headers, 'webhook-timestamp');
  const signature = header(input.headers, 'webhook-signature');
  if (!id || !timestamp || !signature) {
    throw new WebhookVerificationError('MISSING_HEADERS', 'The request is missing webhook-id, webhook-timestamp or webhook-signature.');
  }

  if (!/^\d+$/.test(timestamp)) throw new WebhookVerificationError('BAD_TIMESTAMP', `webhook-timestamp "${timestamp}" is not Unix seconds.`);
  const ts = Number(timestamp);
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - ts) > tolerance) {
    throw new WebhookVerificationError('TIMESTAMP_OUT_OF_TOLERANCE', `The webhook timestamp is ${Math.abs(nowSeconds - ts)} s away from now; the tolerance is ${tolerance} s.`);
  }

  const secrets = Array.isArray(input.secret) ? input.secret : [input.secret];
  const expected = secrets.map((s) => signWebhook(s, id, ts, input.body));
  const presented = signature.split(' ').filter((s) => s.startsWith('v1,'));
  const matches = presented.some((p) => expected.some((e) => safeEqual(p, e)));
  if (!matches) throw new WebhookVerificationError('NO_MATCHING_SIGNATURE', 'No signature matched the secret; the body may have been altered or the secret rotated.');

  const text = typeof input.body === 'string' ? input.body : Buffer.from(input.body).toString('utf8');
  try {
    return JSON.parse(text) as WebhookEvent<T>;
  } catch {
    throw new WebhookVerificationError('INVALID_BODY', 'The signature is valid but the body is not JSON.');
  }
}
