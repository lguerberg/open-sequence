import { HttpError, asNumber, asString, isRecord, joinUrl, parseBody, withQuery } from '../http.js';

export const ALLO_BASE_URL = 'https://api.withallo.com';

/** An Allo error; the message starts with Allo's stable code (`TO_NUMBER_COUNTRY_MISMATCH: …`). */
export class AlloApiError extends HttpError {
  readonly code: string;
  /** Seconds until a `429 API_KEY_QUOTA_EXCEEDED` resets, when Allo says. */
  readonly retryAfterSeconds?: number;

  constructor(status: number, url: string, body: unknown) {
    const { code, message, retryAfterSeconds } = describe(status, body);
    super(status, url, body, `${code}: ${message}`);
    this.name = 'AlloApiError';
    this.code = code;
    if (retryAfterSeconds !== undefined) this.retryAfterSeconds = retryAfterSeconds;
  }
}

function describe(status: number, body: unknown): { code: string; message: string; retryAfterSeconds?: number } {
  const error = isRecord(body) && isRecord(body.error) ? body.error : isRecord(body) ? body : {};
  const code = asString(error.code) ?? asString(error.error_code) ?? asString(error.error) ?? `HTTP_${status}`;
  const message = asString(error.message) ?? asString(error.detail) ?? (typeof body === 'string' ? body : `Allo responded with ${status}`);
  const details = asString(error.details) ?? asString(error.message) ?? '';
  const reset = /reset_in=(\d+)/.exec(details);
  const retryAfterSeconds = reset ? asNumber(reset[1]) : undefined;
  return retryAfterSeconds === undefined ? { code, message } : { code, message, retryAfterSeconds };
}

/** Thin fetch wrapper: raw API key in `Authorization`, JSON in and out, `data` unwrapped by the caller. */
export class AlloClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = ALLO_BASE_URL,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async get(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> {
    return this.request('GET', withQuery(joinUrl(this.baseUrl, path), query));
  }

  async post(path: string, body: unknown): Promise<unknown> {
    return this.request('POST', joinUrl(this.baseUrl, path), body);
  }

  private async request(method: 'GET' | 'POST', url: string, body?: unknown): Promise<unknown> {
    const res = await this.fetchImpl(url, {
      method,
      headers: { Authorization: this.apiKey, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const parsed = await parseBody(res);
    if (!res.ok) throw new AlloApiError(res.status, url, parsed);
    return parsed;
  }
}

/** Allo wraps responses in `data`; lists come as `data: []` or `data: { items: [] }`. */
export function unwrapData(body: unknown): unknown {
  return isRecord(body) && 'data' in body ? body.data : body;
}

export function unwrapList(body: unknown): Record<string, unknown>[] {
  const data = unwrapData(body);
  const list = Array.isArray(data)
    ? data
    : isRecord(data)
      ? (['items', 'numbers', 'users', 'results', 'entries'].map((key) => data[key]).find(Array.isArray) ?? [])
      : [];
  return list.filter(isRecord);
}
