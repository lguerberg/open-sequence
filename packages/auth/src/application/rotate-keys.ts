/**
 * Re-encrypts every row not under the current key (the first SEQ_ENCRYPTION_KEYS entry) so the
 * older keys can be dropped from the list. Safe to run again; rows already current are skipped.
 */
import type { AuthDeps } from './deps.js';

export interface RotateKeysResult {
  keyId: string;
  credentials: number;
  connections: number;
}

export async function rotateKeys(deps: AuthDeps): Promise<RotateKeysResult> {
  const keyId = deps.cipher.currentKeyId;
  let credentials = 0;
  for (const c of await deps.credentials.listNotUnderKey(keyId)) {
    const secret = deps.cipher.encrypt(deps.cipher.decrypt(c.secretEnc, c.keyId));
    const webhook = c.webhookSecretEnc ? deps.cipher.encrypt(deps.cipher.decrypt(c.webhookSecretEnc, c.keyId)).ciphertext : null;
    await deps.credentials.reencrypt(c.id, { secretEnc: secret.ciphertext, webhookSecretEnc: webhook, keyId: secret.keyId });
    credentials += 1;
  }
  let connections = 0;
  for (const c of await deps.connections.listNotUnderKey(keyId)) {
    if (!c.secretEnc || !c.keyId) continue;
    const secret = deps.cipher.encrypt(deps.cipher.decrypt(c.secretEnc, c.keyId));
    await deps.connections.reencrypt(c.id, { secretEnc: secret.ciphertext, keyId: secret.keyId });
    connections += 1;
  }
  return { keyId, credentials, connections };
}
