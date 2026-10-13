/** A recording fetch for the tests: queue responses, inspect what was sent. */
import { expect, test } from 'vitest';
import type { FetchLike } from './client.js';

export interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

export interface FakeFetch extends FetchLike {
  calls: Recorded[];
  /** The last request, for the common one-call assertion. */
  last(): Recorded;
  /** Queue a response; the next request consumes it. Default: `{ success: true, data }` with status 200. */
  reply(data: unknown, init?: { status?: number; meta?: Record<string, unknown>; raw?: string; headers?: Record<string, string> }): void;
  /** Queue an error envelope. */
  fail(status: number, error: { code: string; message: string; details?: unknown }, requestId?: string): void;
  /** Queue a thrown error (network failure). */
  throwNext(error: Error): void;
}

export function fakeFetch(): FakeFetch {
  const queue: Array<{ response?: Response; error?: Error }> = [];
  const calls: Recorded[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? 'GET', headers: { ...(init.headers as Record<string, string>) }, body: typeof init.body === 'string' ? init.body : undefined });
    const next = queue.shift();
    if (!next) throw new Error(`fakeFetch: no response queued for ${init.method} ${url}`);
    if (next.error) throw next.error;
    return next.response!;
  }) as FakeFetch;
  f.calls = calls;
  f.last = () => {
    const c = calls[calls.length - 1];
    if (!c) throw new Error('fakeFetch: no calls yet');
    return c;
  };
  f.reply = (data, init = {}) => {
    const body = init.raw ?? JSON.stringify({ success: true, data, meta: { request_id: 'req_1', ...init.meta } });
    queue.push({ response: new Response(body, { status: init.status ?? 200, headers: { 'content-type': 'application/json', ...init.headers } }) });
  };
  f.fail = (status, error, requestId = 'req_err') => {
    queue.push({ response: new Response(JSON.stringify({ success: false, error, meta: { request_id: requestId } }), { status, headers: { 'content-type': 'application/json' } }) });
  };
  f.throwNext = (error) => queue.push({ error });
  return f;
}

test('fakeFetch records and replays', async () => {
  const f = fakeFetch();
  f.reply({ ok: 1 });
  const res = await f('https://x/y', { method: 'GET' });
  expect(await res.json()).toEqual({ success: true, data: { ok: 1 }, meta: { request_id: 'req_1' } });
  expect(f.last().url).toBe('https://x/y');
});
