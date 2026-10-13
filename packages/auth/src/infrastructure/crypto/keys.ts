/**
 * SEQ_ENCRYPTION_KEYS is `id:base64key[,id:base64key...]`: every key is 32 random bytes, the
 * first entry encrypts new rows, the others only decrypt (rotation, section 14).
 */
export interface EncryptionKey {
  id: string;
  key: Buffer;
}

export function parseEncryptionKeys(spec: string): EncryptionKey[] {
  const entries = spec
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (entries.length === 0) throw new Error('SEQ_ENCRYPTION_KEYS is empty. Expected "id:base64key[,id:base64key...]" with 32-byte keys.');
  const keys = entries.map((entry) => {
    const sep = entry.indexOf(':');
    if (sep <= 0) throw new Error(`SEQ_ENCRYPTION_KEYS entry "${entry.slice(0, 8)}…" is not "id:base64key".`);
    const id = entry.slice(0, sep);
    if (!/^[A-Za-z0-9_-]{1,16}$/.test(id)) throw new Error(`SEQ_ENCRYPTION_KEYS key id "${id}" must be 1-16 characters of [A-Za-z0-9_-].`);
    const key = Buffer.from(entry.slice(sep + 1), 'base64');
    if (key.length !== 32) throw new Error(`SEQ_ENCRYPTION_KEYS key "${id}" decodes to ${key.length} bytes; expected 32.`);
    return { id, key };
  });
  const ids = new Set(keys.map((k) => k.id));
  if (ids.size !== keys.length) throw new Error('SEQ_ENCRYPTION_KEYS has a repeated key id.');
  return keys;
}
