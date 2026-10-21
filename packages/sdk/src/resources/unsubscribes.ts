/**
 * Unsubscribes, for a project that hosts the unsubscribe page in its own app (project setting
 * `unsubscribe_url`, like `https://app.example.com/u/{token}`). Scope `enroll`.
 */
import type { HttpClient } from '../client.js';
import type { UnsubscribeStatus } from '../types.js';

const enc = encodeURIComponent;

export class Unsubscribes {
  constructor(private readonly http: HttpClient) {}

  /** Reads a token without applying it, to render a confirmation page. Never throws on a bad token: it reads `valid: false`. */
  get(token: string): Promise<UnsubscribeStatus> {
    return this.http.request({ method: 'GET', path: `/v1/unsubscribes/${enc(token)}` });
  }

  /**
   * Applies a token: an email suppression for the contact, and its enrollments exit with reason
   * `opt_out`. Idempotent: a second call returns `already_unsubscribed: true`. An invalid or
   * expired token throws `OpenSequenceError` 400 `UNSUBSCRIBE_TOKEN_INVALID` or `UNSUBSCRIBE_TOKEN_EXPIRED`.
   */
  apply(token: string): Promise<UnsubscribeStatus> {
    return this.http.request({ method: 'POST', path: `/v1/unsubscribes/${enc(token)}` });
  }
}
