import type { ConnectionOptions } from 'node:tls';

export const DEFAULT_TIMEOUT_MS = 20_000;

export interface SmtpProviderOptions {
  /**
   * Force reading reply bodies on or off for every poll. Unset (the default), each poll follows
   * its request's `includeBodies`, which the engine sets from the project's `store_inbound_bodies`.
   */
  includeBodies?: boolean;
  now?: () => Date;
  /** Connect, greeting and socket timeout for both protocols. */
  timeoutMs?: number;
  /** Extra TLS settings (a private CA, for self-hosted mail). */
  tls?: ConnectionOptions;
  /** Where a non-fatal problem goes (the Sent copy could not be appended); nothing when unset. Never receives a secret. */
  warn?: (message: string, meta: Record<string, unknown>) => void;
}
