import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Standard Webhooks (https://www.standardwebhooks.com) verification, as used by Allo and by the
 * service's own outbound webhooks: HMAC-SHA256 over `{id}.{timestamp}.{body}` with the
 * base64-decoded secret after `whsec_`, headers `webhook-id`, `webhook-timestamp` (Unix seconds)
 * and `webhook-signature` (`v1,<base64>`, several space-separated during a rotation).
 */

export type WebhookHeaders = Record<string, string | string[] | undefined>;

export class WebhookVerificationError extends Error {
  readonly code = 'WEBHOOK_SIGNATURE_INVALID';
  constructor(reason: string) {
    super(`WEBHOOK_SIGNATURE_INVALID: ${reason}`);
    this.name = 'WebhookVerificationError';
  }
}

export const DEFAULT_TOLERANCE_SECONDS = 300;

export function header(headers: WebhookHeaders, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== wanted) continue;
    return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

function secretBytes(secret: string): Buffer {
  const raw = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  return Buffer.from(raw, 'base64');
}

/** Produces the `webhook-signature` value for a payload; the tests and the outbound sender use it. */
export function signStandardWebhook(opts: { id: string; timestamp: number; body: string | Buffer; secret: string }): string {
  const mac = createHmac('sha256', secretBytes(opts.secret));
  mac.update(`${opts.id}.${opts.timestamp}.`);
  mac.update(opts.body);
  return `v1,${mac.digest('base64')}`;
}

export function verifyStandardWebhook(opts: {
  headers: WebhookHeaders;
  rawBody: Buffer;
  secret: string;
  toleranceSeconds?: number;
  now?: Date;
}): { id: string; timestamp: Date } {
  const id = header(opts.headers, 'webhook-id');
  const timestampRaw = header(opts.headers, 'webhook-timestamp');
  const signatureRaw = header(opts.headers, 'webhook-signature');
  if (!id || !timestampRaw || !signatureRaw) throw new WebhookVerificationError('missing webhook-id, webhook-timestamp or webhook-signature header');

  const timestamp = Number(timestampRaw);
  if (!Number.isInteger(timestamp)) throw new WebhookVerificationError('webhook-timestamp is not a Unix timestamp');
  const nowSeconds = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  const tolerance = opts.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - timestamp) > tolerance) throw new WebhookVerificationError('webhook-timestamp is outside the tolerance window');

  const expected = Buffer.from(signStandardWebhook({ id, timestamp, body: opts.rawBody, secret: opts.secret }).slice('v1,'.length), 'base64');
  const matches = signatureRaw
    .split(' ')
    .filter((part) => part.startsWith('v1,'))
    .some((part) => {
      const given = Buffer.from(part.slice('v1,'.length), 'base64');
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
  if (!matches) throw new WebhookVerificationError('no signature matched');

  return { id, timestamp: new Date(timestamp * 1000) };
}
