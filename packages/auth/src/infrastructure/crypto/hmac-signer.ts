/**
 * HMAC-SHA256 under the current encryption key; verification tries every configured key so a
 * state token signed just before a rotation still verifies inside its ten minutes.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Signer } from '../../domain/ports.js';
import { parseEncryptionKeys, type EncryptionKey } from './keys.js';

export class HmacSigner implements Signer {
  private readonly keys: EncryptionKey[];

  constructor(keys: string | EncryptionKey[]) {
    this.keys = typeof keys === 'string' ? parseEncryptionKeys(keys) : keys;
  }

  sign(payload: string): string {
    return createHmac('sha256', this.keys[0]!.key).update(payload).digest('base64url');
  }

  verify(payload: string, signature: string): boolean {
    const given = Buffer.from(signature, 'base64url');
    return this.keys.some((k) => {
      const expected = createHmac('sha256', k.key).update(payload).digest();
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
  }
}
