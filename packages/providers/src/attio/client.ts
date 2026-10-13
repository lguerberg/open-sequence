import { HttpError, asString, isRecord, joinUrl, parseBody, withQuery } from '../http.js';

export const ATTIO_BASE_URL = 'https://api.attio.com';

/** Attio errors: `{ status_code, type, code, message }`. 401/403 are auth errors the engine should surface, not retry. */
export class AttioApiError extends HttpError {
  readonly code: string;
  constructor(status: number, url: string, body: unknown) {
    const code = (isRecord(body) && asString(body.code)) || `HTTP_${status}`;
    const message = (isRecord(body) && asString(body.message)) || `Attio responded with ${status}`;
    super(status, url, body, `${code}: ${message}`);
    this.name = 'AttioApiError';
    this.code = code;
  }
  get isAuth(): boolean {
    return this.status === 401 || this.status === 403;
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }
}

/** Bearer token, JSON in and out; the `data` envelope is unwrapped by the caller. */
export class AttioClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = ATTIO_BASE_URL,
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
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const parsed = await parseBody(res);
    if (!res.ok) throw new AttioApiError(res.status, url, parsed);
    return parsed;
  }
}

export function dataOf(body: unknown): unknown {
  return isRecord(body) ? body.data : undefined;
}

export function dataList(body: unknown): Record<string, unknown>[] {
  const data = dataOf(body);
  return Array.isArray(data) ? data.filter(isRecord) : [];
}
