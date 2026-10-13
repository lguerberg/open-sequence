import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BACKOFF_MS, isPrivateAddress, isSafeUrl, newSecret, normalizeEventTypes, sign, signedHeaders, unsafeUrlReason } from './shared.js';

describe('Standard Webhooks signing', () => {
  it('signs id.timestamp.body with the decoded secret bytes', () => {
    const secret = 'whsec_' + Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
    const body = '{"type":"run.done"}';
    const expected = createHmac('sha256', Buffer.from('0123456789abcdef0123456789abcdef')).update(`evt_1.1700000000.${body}`).digest('base64');
    expect(sign(secret, 'evt_1', 1700000000, body)).toBe(`v1,${expected}`);
  });

  it('puts the three headers on the request, with the timestamp in seconds', () => {
    const secret = newSecret();
    const at = new Date(1700000000500);
    const h = signedHeaders(secret, 'evt_2', at, '{}');
    expect(h['webhook-id']).toBe('evt_2');
    expect(h['webhook-timestamp']).toBe('1700000000');
    expect(h['webhook-signature']).toBe(sign(secret, 'evt_2', 1700000000, '{}'));
    expect(h['content-type']).toBe('application/json');
  });

  it('generates a whsec_ secret of 32 random bytes', () => {
    const s = newSecret();
    expect(s.startsWith('whsec_')).toBe(true);
    expect(Buffer.from(s.slice(6), 'base64')).toHaveLength(32);
    expect(newSecret()).not.toBe(s);
  });
});

describe('backoff schedule', () => {
  it('is immediate, 5 s, 5 min, 30 min, 2 h, 5 h, then three times 10 h', () => {
    expect(BACKOFF_MS).toEqual([0, 5_000, 300_000, 1_800_000, 7_200_000, 18_000_000, 36_000_000, 36_000_000, 36_000_000]);
  });
  it('spans about a day and a half of retries before a delivery is failed for good', () => {
    const total = BACKOFF_MS.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(36 * 3_600_000);
    expect(BACKOFF_MS[BACKOFF_MS.length]).toBeUndefined();
  });
});

describe('event types', () => {
  it('accepts * alone or known types, de-duplicated', () => {
    expect(normalizeEventTypes(['*'])).toEqual(['*']);
    expect(normalizeEventTypes(['run.done', 'run.done', 'enrollment.exited'])).toEqual(['run.done', 'enrollment.exited']);
  });
  it('rejects unknown types and * mixed with types', () => {
    expect(() => normalizeEventTypes(['run.done', 'nope'])).toThrow(/Unknown event type: nope/);
    expect(() => normalizeEventTypes(['*', 'run.done'])).toThrow(/Unknown event type/);
  });
});

describe('isSafeUrl', () => {
  const publicHost = async () => ['93.184.216.34'];

  it('rejects http', async () => {
    expect(await unsafeUrlReason('http://hooks.example.com/x', publicHost)).toBe('must use https');
    expect(await isSafeUrl('http://hooks.example.com/x', publicHost)).toBe(false);
  });
  it('rejects localhost and local suffixes without resolving', async () => {
    let resolved = false;
    const spy = async () => {
      resolved = true;
      return ['1.2.3.4'];
    };
    expect(await isSafeUrl('https://localhost/x', spy)).toBe(false);
    expect(await isSafeUrl('https://db.internal/x', spy)).toBe(false);
    expect(await isSafeUrl('https://printer.local/x', spy)).toBe(false);
    expect(resolved).toBe(false);
  });
  it('rejects hosts resolving to private, loopback, link-local or metadata addresses', async () => {
    expect(await isSafeUrl('https://hooks.example.com/x', async () => ['10.0.0.1'])).toBe(false);
    expect(await isSafeUrl('https://hooks.example.com/x', async () => ['169.254.169.254'])).toBe(false);
    expect(await isSafeUrl('https://hooks.example.com/x', async () => ['93.184.216.34', '127.0.0.1'])).toBe(false);
    expect(await isSafeUrl('https://hooks.example.com/x', async () => ['::ffff:10.0.0.1'])).toBe(false);
    expect(await isSafeUrl('https://hooks.example.com/x', async () => ['fd00:ec2::254'])).toBe(false);
  });
  it('rejects IP literals in the private ranges and hosts that do not resolve', async () => {
    expect(await isSafeUrl('https://10.0.0.1/x', publicHost)).toBe(false);
    expect(await isSafeUrl('https://[::1]/x', publicHost)).toBe(false);
    expect(await unsafeUrlReason('https://nope.example.com/x', async () => [])).toBe('host does not resolve');
  });
  it('accepts a public https host', async () => {
    expect(await isSafeUrl('https://hooks.example.com/x', publicHost)).toBe(true);
    expect(await isSafeUrl('https://hooks.example.com/x', async () => ['2606:2800:220:1:248:1893:25c8:1946'])).toBe(true);
  });
  it('classifies addresses', () => {
    expect(isPrivateAddress('172.16.5.5')).toBe(true);
    expect(isPrivateAddress('172.32.0.1')).toBe(false);
    expect(isPrivateAddress('100.64.0.1')).toBe(true);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('fe80::1')).toBe(true);
    expect(isPrivateAddress('not-an-ip')).toBe(true);
  });
});
