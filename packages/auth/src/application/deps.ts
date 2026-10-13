/**
 * What every use case receives. The composition root (createAuth) builds one of these; tests build
 * one with fakes.
 */
import type { Cipher, Clock, IdGenerator, OAuthClient, Signer } from '../domain/ports.js';
import type { ConnectionRepository, CredentialRepository } from '../domain/repositories.js';

export interface AuthDeps {
  credentials: CredentialRepository;
  connections: ConnectionRepository;
  cipher: Cipher;
  signer: Signer;
  clock: Clock;
  ids: IdGenerator;
  google: OAuthClient;
  /** Where Google sends the user back: `${publicUrl}${googleCallbackPath}`. */
  googleRedirectUri: string;
  /** The in-memory access-token cache, one per replica (section 3.2). */
  tokens: TokenCache;
}

export interface CachedToken {
  accessToken: string;
  expiresAt: Date;
}

export class TokenCache {
  private readonly tokens = new Map<string, CachedToken>();
  private readonly pending = new Map<string, Promise<string>>();

  get(connectionId: string): CachedToken | undefined {
    return this.tokens.get(connectionId);
  }

  set(connectionId: string, token: CachedToken): void {
    this.tokens.set(connectionId, token);
  }

  forget(connectionId: string): void {
    this.tokens.delete(connectionId);
  }

  /** Runs `refresh` once per connection at a time; concurrent callers share the same promise. */
  single(connectionId: string, refresh: () => Promise<string>): Promise<string> {
    const inFlight = this.pending.get(connectionId);
    if (inFlight) return inFlight;
    const p = refresh().finally(() => this.pending.delete(connectionId));
    this.pending.set(connectionId, p);
    return p;
  }
}

export const GOOGLE_PROVIDER = 'google';
export const GOOGLE_SCOPES = {
  send: 'https://www.googleapis.com/auth/gmail.send',
  read: 'https://www.googleapis.com/auth/gmail.readonly',
  calendar: 'https://www.googleapis.com/auth/calendar.readonly',
  /** Only to learn which account consented (userinfo); not a sensitive scope. */
  email: 'https://www.googleapis.com/auth/userinfo.email',
} as const;
export const GOOGLE_REQUIRED_SCOPES = [GOOGLE_SCOPES.send, GOOGLE_SCOPES.read];
export const GOOGLE_REQUESTED_SCOPES = [GOOGLE_SCOPES.send, GOOGLE_SCOPES.read, GOOGLE_SCOPES.calendar, GOOGLE_SCOPES.email];
