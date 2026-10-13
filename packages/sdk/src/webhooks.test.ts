/** verifyWebhook must accept exactly what packages/engine's signer produces: recomputed here with node:crypto, plus one frozen vector. */
import { createHmac, randomBytes } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { WebhookVerificationError, signWebhook, verifyWebhook } from './index.js';

/** The engine's recipe (packages/engine/src/application/webhooks/shared.ts), copied rather than imported. */
function engineSign(secret: string, id: string, ts: number, body: string): string {
  const bytes = Buffer.from(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret, 'base64');
  return `v1,${createHmac('sha256', bytes).update(`${id}.${ts}.${body}`).digest('base64')}`;
}
function engineHeaders(secret: string, id: string, at: Date, body: string): Record<string, string> {
  const ts = Math.floor(at.getTime() / 1000);
  return { 'content-type': 'application/json', 'user-agent': 'OpenSequence-Webhooks/1', 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': engineSign(secret, id, ts, body) };
}

const now = new Date('2026-10-13T10:00:00Z');
const secret = `whsec_${randomBytes(32).toString('base64')}`;
const event = { id: 'evt_1', type: 'enrollment.exited', project: 'prj_1', occurred_at: now.toISOString(), data: { enrollment: 'enr_1', exit_reason: 'replied' } };
const body = JSON.stringify(event);

describe('verifyWebhook', () => {
  test('accepts what the engine signs and returns the parsed event', () => {
    const headers = engineHeaders(secret, 'evt_1', now, body);
    expect(verifyWebhook({ secret, headers, body, now })).toEqual(event);
  });

  test('signWebhook matches the engine recipe', () => {
    expect(signWebhook(secret, 'evt_1', 1760349600, body)).toBe(engineSign(secret, 'evt_1', 1760349600, body));
    expect(signWebhook(secret, 'evt_1', 1760349600, Buffer.from(body))).toBe(engineSign(secret, 'evt_1', 1760349600, body));
  });

  test('frozen vector', () => {
    const vector = {
      secret: 'whsec_MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
      id: 'evt_01J9TESTVECTOR0000000000',
      ts: 1760349600,
      body: '{"id":"evt_01J9TESTVECTOR0000000000","type":"enrollment.exited","project":"prj_1","occurred_at":"2026-10-13T10:00:00.000Z","data":{"enrollment":"enr_1","exit_reason":"replied"}}',
      sig: 'v1,9DEPN4vQuTuiaWACxGRAQjCtowuOjO/ga6voT6Dj2Uc=',
    };
    expect(signWebhook(vector.secret, vector.id, vector.ts, vector.body)).toBe(vector.sig);
    const parsed = verifyWebhook<{ exit_reason: string }>({
      secret: vector.secret,
      headers: { 'webhook-id': vector.id, 'webhook-timestamp': String(vector.ts), 'webhook-signature': vector.sig },
      body: vector.body,
      now: new Date(vector.ts * 1000),
    });
    expect(parsed.data.exit_reason).toBe('replied');
  });

  test('takes Fetch Headers and a Uint8Array body', () => {
    const headers = new Headers(engineHeaders(secret, 'evt_1', now, body));
    expect(verifyWebhook({ secret, headers, body: new TextEncoder().encode(body), now })).toEqual(event);
  });

  test('header lookup is case-insensitive on plain objects', () => {
    const h = engineHeaders(secret, 'evt_1', now, body);
    const headers = { 'Webhook-Id': h['webhook-id'], 'Webhook-Timestamp': h['webhook-timestamp'], 'Webhook-Signature': h['webhook-signature'] };
    expect(verifyWebhook({ secret, headers, body, now })).toEqual(event);
  });

  test('rejects a tampered body', () => {
    const headers = engineHeaders(secret, 'evt_1', now, body);
    const tampered = body.replace('replied', 'manual');
    expect(() => verifyWebhook({ secret, headers, body: tampered, now })).toThrow(WebhookVerificationError);
    expect(() => verifyWebhook({ secret, headers, body: tampered, now })).toThrow(/No signature matched/);
  });

  test('rejects the wrong secret with code NO_MATCHING_SIGNATURE', () => {
    const headers = engineHeaders(secret, 'evt_1', now, body);
    const err = (() => {
      try {
        verifyWebhook({ secret: `whsec_${randomBytes(32).toString('base64')}`, headers, body, now });
      } catch (e) {
        return e as WebhookVerificationError;
      }
    })();
    expect(err?.code).toBe('NO_MATCHING_SIGNATURE');
  });

  test('rejects a stale timestamp, in either direction, honouring toleranceSeconds', () => {
    const headers = engineHeaders(secret, 'evt_1', now, body);
    const later = new Date(now.getTime() + 301_000);
    expect(() => verifyWebhook({ secret, headers, body, now: later })).toThrow(/tolerance is 300 s/);
    const earlier = new Date(now.getTime() - 301_000);
    expect(() => verifyWebhook({ secret, headers, body, now: earlier })).toThrow(WebhookVerificationError);
    expect(verifyWebhook({ secret, headers, body, now: later, toleranceSeconds: 600 })).toEqual(event);
    expect(() => verifyWebhook({ secret, headers, body, now: new Date(now.getTime() + 31_000), toleranceSeconds: 30 })).toThrow(/TIMESTAMP|tolerance/);
  });

  test('a non-numeric timestamp is BAD_TIMESTAMP', () => {
    const headers = { ...engineHeaders(secret, 'evt_1', now, body), 'webhook-timestamp': '2026-10-13T10:00:00Z' };
    expect(() => verifyWebhook({ secret, headers, body, now })).toThrow(/not Unix seconds/);
  });

  test('missing headers', () => {
    const headers = engineHeaders(secret, 'evt_1', now, body);
    delete headers['webhook-signature'];
    expect(() => verifyWebhook({ secret, headers, body, now })).toThrow(/missing webhook-id, webhook-timestamp or webhook-signature/);
  });

  test('rotation: the receiver holds two secrets, the sender one of them', () => {
    const oldSecret = secret;
    const newSecret = `whsec_${randomBytes(32).toString('base64')}`;
    const signedWithNew = engineHeaders(newSecret, 'evt_1', now, body);
    expect(verifyWebhook({ secret: [oldSecret, newSecret], headers: signedWithNew, body, now })).toEqual(event);
    const signedWithOld = engineHeaders(oldSecret, 'evt_1', now, body);
    expect(verifyWebhook({ secret: [oldSecret, newSecret], headers: signedWithOld, body, now })).toEqual(event);
  });

  test('rotation: the sender presents several space-separated signatures', () => {
    const other = `whsec_${randomBytes(32).toString('base64')}`;
    const ts = Math.floor(now.getTime() / 1000);
    const headers = { 'webhook-id': 'evt_1', 'webhook-timestamp': String(ts), 'webhook-signature': `${engineSign(other, 'evt_1', ts, body)} ${engineSign(secret, 'evt_1', ts, body)}` };
    expect(verifyWebhook({ secret, headers, body, now })).toEqual(event);
    const unknownVersion = { ...headers, 'webhook-signature': `v2,${engineSign(secret, 'evt_1', ts, body).slice(3)}` };
    expect(() => verifyWebhook({ secret, headers: unknownVersion, body, now })).toThrow(WebhookVerificationError);
  });

  test('a valid signature over a non-JSON body is INVALID_BODY', () => {
    const headers = engineHeaders(secret, 'evt_1', now, 'not json');
    expect(() => verifyWebhook({ secret, headers, body: 'not json', now })).toThrow(/not JSON/);
  });
});
