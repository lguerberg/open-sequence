/**
 * What the use cases need from the outside world. Infrastructure implements these; tests fake them.
 */
export interface Cipher {
  /** The id of the key new ciphertext is written under (the first SEQ_ENCRYPTION_KEYS entry). */
  readonly currentKeyId: string;
  encrypt(plain: string): { ciphertext: string; keyId: string };
  decrypt(ciphertext: string, keyId: string): string;
}

export interface ProbeResult {
  ok: boolean;
  scopes?: string[];
  missing?: string[];
  error?: string;
}

/** Validates an API key against the provider before it is stored (Allo `GET /v2/api/me`, Attio `GET /v2/self`). */
export type Probe = (secrets: Record<string, string>) => Promise<ProbeResult>;

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(kind: 'credential' | 'connection'): string;
}

export const systemClock: Clock = { now: () => new Date() };

/** What the providers package needs from auth for API-key providers, without importing it. */
export interface CredentialSource {
  credentialsFor(tenantId: string, provider: string): Promise<Record<string, string>>;
}

/** What the providers package needs from auth for password connections (SMTP and IMAP), without importing it. */
export interface ConnectionSecretSource {
  connectionSecrets(connectionId: string): Promise<{ account: string | null; config: Record<string, unknown>; secrets: Record<string, string> }>;
}
