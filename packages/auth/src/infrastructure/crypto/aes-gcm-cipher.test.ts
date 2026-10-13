import { describe, expect, it } from 'vitest';
import { AesGcmCipher } from './aes-gcm-cipher.js';
import { parseEncryptionKeys } from './keys.js';
import { KEY_A, KEY_B } from '../../test/db.js';

describe('AesGcmCipher', () => {
  it('round-trips and never repeats a ciphertext', () => {
    const cipher = new AesGcmCipher(KEY_A);
    const a = cipher.encrypt('refresh-token-1');
    const b = cipher.encrypt('refresh-token-1');
    expect(a.keyId).toBe('ka');
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(cipher.decrypt(a.ciphertext, a.keyId)).toBe('refresh-token-1');
    expect(cipher.decrypt(b.ciphertext, b.keyId)).toBe('refresh-token-1');
  });

  it('encrypts under the first key and decrypts under any listed key', () => {
    const old = new AesGcmCipher(KEY_A).encrypt('s');
    const rotated = new AesGcmCipher(`${KEY_B},${KEY_A}`);
    expect(rotated.currentKeyId).toBe('kb');
    expect(rotated.decrypt(old.ciphertext, 'ka')).toBe('s');
    expect(rotated.encrypt('s').keyId).toBe('kb');
  });

  it('refuses a tampered ciphertext and an unknown key id', () => {
    const cipher = new AesGcmCipher(KEY_A);
    const { ciphertext } = cipher.encrypt('s');
    const buf = Buffer.from(ciphertext, 'base64');
    buf[buf.length - 1] = buf[buf.length - 1]! ^ 0xff;
    expect(() => cipher.decrypt(buf.toString('base64'), 'ka')).toThrow();
    expect(() => cipher.decrypt(ciphertext, 'kz')).toThrow(/not in SEQ_ENCRYPTION_KEYS/);
  });

  it('validates the key list', () => {
    expect(() => parseEncryptionKeys('')).toThrow(/empty/);
    expect(() => parseEncryptionKeys('ka:' + Buffer.alloc(16, 1).toString('base64'))).toThrow(/expected 32/);
    expect(() => parseEncryptionKeys(`${KEY_A},${KEY_A}`)).toThrow(/repeated/);
    expect(() => parseEncryptionKeys('nocolon')).toThrow(/id:base64key/);
  });
});
