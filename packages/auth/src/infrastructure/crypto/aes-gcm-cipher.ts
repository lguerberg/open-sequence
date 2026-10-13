/**
 * AES-256-GCM under SEQ_ENCRYPTION_KEYS. Ciphertext is base64 of iv (12) | tag (16) | data, and
 * every row stores the id of the key that produced it so decrypt can find the key after rotation.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Cipher } from '../../domain/ports.js';
import { parseEncryptionKeys, type EncryptionKey } from './keys.js';

const IV_BYTES = 12;
const TAG_BYTES = 16;

export class AesGcmCipher implements Cipher {
  private readonly keys: Map<string, Buffer>;
  readonly currentKeyId: string;

  constructor(keys: string | EncryptionKey[]) {
    const parsed = typeof keys === 'string' ? parseEncryptionKeys(keys) : keys;
    this.keys = new Map(parsed.map((k) => [k.id, k.key]));
    this.currentKeyId = parsed[0]!.id;
  }

  encrypt(plain: string): { ciphertext: string; keyId: string } {
    const key = this.keys.get(this.currentKeyId)!;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { ciphertext: Buffer.concat([iv, tag, data]).toString('base64'), keyId: this.currentKeyId };
  }

  decrypt(ciphertext: string, keyId: string): string {
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`Encryption key "${keyId}" is not in SEQ_ENCRYPTION_KEYS; the secret cannot be read until that key is restored or the secret is re-entered.`);
    const buf = Buffer.from(ciphertext, 'base64');
    if (buf.length < IV_BYTES + TAG_BYTES) throw new Error('Ciphertext is too short to be valid.');
    const iv = buf.subarray(0, IV_BYTES);
    const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const data = buf.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }
}
