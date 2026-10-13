import type { TokenSource } from './token-source.js';

/**
 * A Google API call that failed. `transient` tells the executor to retry with backoff;
 * a 401 surfaces as a message starting with `credentials_needed` so the engine pauses the
 * channel and asks the sender to reconnect instead of retrying.
 */
export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly transient: boolean,
    readonly reason?: string,
  ) {
    super(message);
    this.name = 'GoogleApiError';
  }
}

export interface GoogleHttp {
  tokens: TokenSource;
  fetch: typeof fetch;
}

const QUOTA_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded', 'dailyLimitExceeded', 'backendError']);

interface GoogleErrorBody {
  error?: { code?: number; message?: string; errors?: Array<{ reason?: string; message?: string }>; status?: string };
}

/** Reads Google's error envelope without throwing on a non-JSON body. */
export async function readError(res: Response): Promise<{ message: string; reason?: string }> {
  const text = await res.text().catch(() => '');
  try {
    const body = JSON.parse(text) as GoogleErrorBody;
    const reason = body.error?.errors?.[0]?.reason;
    return { message: body.error?.message ?? text, reason };
  } catch {
    return { message: text };
  }
}

/**
 * Performs one authenticated request. Maps the statuses every caller treats the same way
 * (401 → credentials_needed, 403 quota → transient, 429 and 5xx → transient) and hands every
 * other response back, so callers can give 404 and 410 their endpoint-specific meaning.
 */
export async function googleRequest(http: GoogleHttp, connectionId: string, url: string, init: RequestInit = {}): Promise<Response> {
  const token = await http.tokens.accessToken(connectionId);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  let res: Response;
  try {
    res = await http.fetch(url, { ...init, headers });
  } catch (err) {
    throw new GoogleApiError(`Google is unreachable: ${(err as Error).message}`, 0, true);
  }

  if (res.status === 401) {
    await discard(res);
    throw new GoogleApiError(`credentials_needed: Google rejected the access token for connection ${connectionId}`, 401, false);
  }
  if (res.status === 429 || res.status >= 500) {
    const { message, reason } = await readError(res);
    throw new GoogleApiError(`Google answered ${res.status}: ${message}`, res.status, true, reason);
  }
  if (res.status === 403) {
    const { message, reason } = await readError(res);
    const quota = (reason !== undefined && QUOTA_REASONS.has(reason)) || /quota|rate limit/i.test(message);
    // A quota or rate-limit refusal clears on its own; anything else (missing scope, disabled API) does not.
    throw new GoogleApiError(`Google refused the request: ${message}`, 403, quota, reason);
  }
  return res;
}

/** Drains a body we do not need, so the connection is released. */
export async function discard(res: Response): Promise<void> {
  await res.text().catch(() => undefined);
}

/** Parses a successful JSON response; any other status becomes a non-transient error. */
export async function expectJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const { message, reason } = await readError(res);
    throw new GoogleApiError(`Google answered ${res.status}: ${message}`, res.status, false, reason);
  }
  return (await res.json()) as T;
}

export function withQuery(url: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, value);
  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
}
