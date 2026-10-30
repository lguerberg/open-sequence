/**
 * The HTTP core every resource uses: one `request()` that sends JSON, unwraps the
 * `{ success, data, meta }` envelope and turns every failure into an OpenSequenceError;
 * `list()` for one cursor page and `paginate()` to walk every page.
 */
import { OpenSequenceError } from './errors.js';

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface ClientOptions {
  /** `https://sequences.example.com` (no trailing `/v1`). */
  baseUrl: string;
  /** A project API key (`sk_live_…`), or the operator token for the admin client. */
  apiKey: string;
  /** Defaults to the global `fetch`. Tests inject one. */
  fetch?: FetchLike;
  /** Abort a request after this long. Default 30 s; 0 disables. */
  timeoutMs?: number;
  /** Sent as `user-agent`. */
  userAgent?: string;
}

export type QueryValue = string | number | boolean | Date | null | undefined | Array<string | number | boolean>;
export type Query = Record<string, QueryValue>;

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Query;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface Page<T> {
  items: T[];
  /** Pass as `cursor` for the next page; null when this was the last one. */
  nextCursor: string | null;
}

/** Cursor pagination, accepted by every list endpoint. A type alias (not an interface) so it stays assignable to `Query`. */
export type ListQuery = {
  limit?: number;
  cursor?: string;
  updated_since?: string | Date;
};

interface OkEnvelope<T> {
  success: true;
  data: T;
  meta?: { request_id?: string; next_cursor?: string | null };
}
interface ErrEnvelope {
  success: false;
  error: { code: string; message: string; details?: unknown };
  meta?: { request_id?: string };
}

export const SDK_VERSION = '0.2.0';
const DEFAULT_TIMEOUT_MS = 30_000;

/** Query string with Dates as ISO, arrays repeated, null/undefined dropped. */
export function encodeQuery(query: Query | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) params.append(key, v instanceof Date ? v.toISOString() : String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  constructor(options: ClientOptions) {
    if (!options.baseUrl) throw new Error('OpenSequence: baseUrl is required.');
    if (!options.apiKey) throw new Error('OpenSequence: apiKey is required.');
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    const f = options.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (!f) throw new Error('OpenSequence: no fetch available; pass one in the options.');
    this.fetchImpl = f;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.userAgent = options.userAgent ?? `opensequence-sdk/${SDK_VERSION}`;
  }

  /** Sends the request and returns the envelope's `data`. */
  async request<T>(options: RequestOptions): Promise<T> {
    return (await this.send<T>(options)).data;
  }

  /** One page of a list endpoint. */
  async list<T>(path: string, query?: Query): Promise<Page<T>> {
    const { data, nextCursor } = await this.send<T[]>({ method: 'GET', path, query });
    return { items: data, nextCursor };
  }

  /** Every item of a list endpoint, page after page, until `next_cursor` is null. */
  async *paginate<T>(path: string, query?: Query): AsyncGenerator<T, void, undefined> {
    let cursor: string | undefined = typeof query?.['cursor'] === 'string' ? (query['cursor'] as string) : undefined;
    for (;;) {
      const page: Page<T> = await this.list<T>(path, { ...query, cursor });
      for (const item of page.items) yield item;
      if (!page.nextCursor || page.items.length === 0) return;
      cursor = page.nextCursor;
    }
  }

  private async send<T>(options: RequestOptions): Promise<{ data: T; nextCursor: string | null; requestId: string | undefined }> {
    const url = `${this.baseUrl}${options.path}${encodeQuery(options.query)}`;
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
      accept: 'application/json',
      'user-agent': this.userAgent,
      ...options.headers,
    };
    const hasBody = options.body !== undefined;
    if (hasBody) headers['content-type'] = 'application/json';

    const controller = this.timeoutMs > 0 ? new AbortController() : undefined;
    const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : undefined;
    if (controller && options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: options.method,
        headers,
        body: hasBody ? JSON.stringify(options.body) : undefined,
        signal: controller?.signal ?? options.signal,
      });
    } catch (cause) {
      const timedOut = controller?.signal.aborted && !options.signal?.aborted;
      throw new OpenSequenceError({
        status: 0,
        code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
        message: timedOut ? `The request to ${options.method} ${options.path} took longer than ${this.timeoutMs} ms.` : `Could not reach ${url}: ${(cause as Error)?.message ?? String(cause)}`,
        cause,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }

    const text = await response.text();
    let parsed: unknown = undefined;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new OpenSequenceError({
          status: response.status,
          code: 'INVALID_RESPONSE',
          message: `${options.method} ${options.path} returned ${response.status} with a body that is not JSON.`,
          details: { body: text.slice(0, 500) },
          requestId: response.headers.get('x-request-id') ?? undefined,
        });
      }
    }

    const envelope = parsed as OkEnvelope<T> | ErrEnvelope | undefined;
    if (envelope && envelope.success === false && envelope.error) {
      throw new OpenSequenceError({
        status: response.status,
        code: envelope.error.code,
        message: envelope.error.message,
        details: envelope.error.details,
        requestId: envelope.meta?.request_id,
      });
    }
    if (!response.ok) {
      throw new OpenSequenceError({
        status: response.status,
        code: `HTTP_${response.status}`,
        message: `${options.method} ${options.path} returned ${response.status}.`,
        details: parsed,
        requestId: response.headers.get('x-request-id') ?? undefined,
      });
    }
    if (!envelope || envelope.success !== true) {
      throw new OpenSequenceError({
        status: response.status,
        code: 'INVALID_RESPONSE',
        message: `${options.method} ${options.path} returned ${response.status} without the { success, data } envelope.`,
        details: parsed,
      });
    }
    return { data: envelope.data, nextCursor: envelope.meta?.next_cursor ?? null, requestId: envelope.meta?.request_id };
  }
}
