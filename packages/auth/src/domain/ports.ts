/**
 * What the use cases need from the outside world. Infrastructure implements these; tests fake them.
 */
export interface Cipher {
  /** The id of the key new ciphertext is written under (the first SEQ_ENCRYPTION_KEYS entry). */
  readonly currentKeyId: string;
  encrypt(plain: string): { ciphertext: string; keyId: string };
  decrypt(ciphertext: string, keyId: string): string;
}

/** Signs short-lived tokens (the OAuth `state`) under the same key material as the cipher. */
export interface Signer {
  sign(payload: string): string;
  verify(payload: string, signature: string): boolean;
}

export interface OAuthClientCredentials {
  clientId: string;
  clientSecret: string;
}

export interface OAuthGrant {
  refreshToken: string | null;
  accessToken: string;
  expiresAt: Date;
  scopes: string[];
  /** The account that consented, when the provider tells us (Google: the email). */
  email: string | null;
}

export interface OAuthClient {
  authUrl(params: { clientId: string; redirectUri: string; scopes: string[]; state: string; loginHint?: string }): string;
  exchangeCode(client: OAuthClientCredentials, code: string, redirectUri: string): Promise<OAuthGrant>;
  /** Rejects with an Error whose message starts with `invalid_grant` when the refresh token is dead. */
  refresh(client: OAuthClientCredentials, refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }>;
  revoke(token: string): Promise<void>;
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

/** What the providers package needs from auth for OAuth providers, without importing it. */
export interface TokenSource {
  accessToken(connectionId: string): Promise<string>;
}

/** What the providers package needs from auth for API-key providers, without importing it. */
export interface CredentialSource {
  credentialsFor(tenantId: string, provider: string): Promise<Record<string, string>>;
}

/** What the providers package needs from auth for password connections (SMTP and IMAP), without importing it. */
export interface ConnectionSecretSource {
  connectionSecrets(connectionId: string): Promise<{ account: string | null; config: Record<string, unknown>; secrets: Record<string, string> }>;
}
