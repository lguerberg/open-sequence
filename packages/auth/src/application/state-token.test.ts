import { describe, expect, it } from 'vitest';
import { HmacSigner } from '../infrastructure/crypto/hmac-signer.js';
import { KEY_A, KEY_B } from '../test/db.js';
import { signState, STATE_TTL_MS, verifyState } from './state-token.js';

const signer = new HmacSigner(KEY_A);
const at = (ms: number) => ({ now: () => new Date(ms) });
const payload = { tenantId: 'prj_1', ownerId: 'snd_1', connectionId: 'con_1', returnUrl: 'https://app/x' };

describe('state token', () => {
  it('signs and verifies within ten minutes', () => {
    const state = signState(signer, at(1_000_000), payload);
    expect(state).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const back = verifyState(signer, at(1_000_000 + STATE_TTL_MS - 1), state);
    expect(back).toEqual({ ...payload, exp: 1_000_000 + STATE_TTL_MS });
  });

  it('expires after ten minutes', () => {
    const state = signState(signer, at(1_000_000), payload);
    expect(() => verifyState(signer, at(1_000_000 + STATE_TTL_MS + 1), state)).toThrow(expect.objectContaining({ code: 'STATE_EXPIRED' }));
  });

  it('rejects a tampered payload, a wrong signature and a malformed token', () => {
    const state = signState(signer, at(1_000_000), payload);
    const [body, sig] = state.split('.') as [string, string];
    const forged = Buffer.from(JSON.stringify({ ...payload, ownerId: 'snd_evil', exp: 9e15 }), 'utf8').toString('base64url');
    expect(() => verifyState(signer, at(1_000_000), `${forged}.${sig}`)).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
    expect(() => verifyState(signer, at(1_000_000), `${body}.${sig.slice(0, -2)}zz`)).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
    expect(() => verifyState(signer, at(1_000_000), 'garbage')).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
    expect(() => verifyState(new HmacSigner(KEY_B), at(1_000_000), state)).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
  });

  it('still verifies a token signed just before a rotation', () => {
    const state = signState(signer, at(1_000_000), payload);
    expect(verifyState(new HmacSigner(`${KEY_B},${KEY_A}`), at(1_000_000), state).connectionId).toBe('con_1');
  });
});
