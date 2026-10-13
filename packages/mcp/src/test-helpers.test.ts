/**
 * Test harness: the real hosted server on a free local port, a recording fetch injected into the
 * SDK clients it builds per call, and FastMCP's client talking to it over HTTP with a bearer key.
 * Nothing reaches a real API.
 */
import type { FetchLike } from '@opensequence/sdk';
import { Client } from '@prefecthq/fastmcp-ts/client';
import type { CallToolResult } from '@prefecthq/fastmcp-ts/client';
import type { Logger } from '@prefecthq/fastmcp-ts/server';
import { expect, test } from 'vitest';
import { createHttpServer, serveHttp } from './http.js';

export const BASE = 'https://seq.example.com';
export const API_KEY = 'sk_live_test_secret_never_shown';

/** A valid-looking service id: prefix, underscore, 26 Crockford base32 characters. */
export const sid = (prefix: string, tail = 'A') => `${prefix}_01J9${tail.repeat(22)}`;

export interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface FakeFetch extends FetchLike {
  calls: Recorded[];
  last(): Recorded;
  /** Queue `{ success: true, data }`; `nextCursor` goes into `meta.next_cursor`. */
  reply(data: unknown, nextCursor?: string | null): void;
  /** Queue an error envelope. */
  fail(status: number, error: { code: string; message: string; details?: unknown }): void;
  /** Queue a network failure. */
  throwNext(error: Error): void;
}

export function fakeFetch(): FakeFetch {
  const queue: Array<{ response?: Response; error?: Error }> = [];
  const calls: Recorded[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      headers: { ...(init.headers as Record<string, string>) },
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    });
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
  f.reply = (data, nextCursor) => {
    const meta = {
      request_id: 'req_1',
      ...(nextCursor !== undefined ? { next_cursor: nextCursor } : {}),
    };
    queue.push({
      response: new Response(JSON.stringify({ success: true, data, meta }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    });
  };
  f.fail = (status, error) => {
    queue.push({
      response: new Response(
        JSON.stringify({ success: false, error, meta: { request_id: 'req_err' } }),
        { status, headers: { 'content-type': 'application/json' } }
      ),
    });
  };
  f.throwNext = (error) => queue.push({ error });
  return f;
}

/** `legacy` is the 2025-11-25 handshake most clients speak; `modern` pins 2026-07-28. */
export type Era = 'legacy' | 'modern';

export interface Harness {
  fetch: FakeFetch;
  client: Client;
  /** `http://127.0.0.1:<port>`, for raw requests. */
  origin: string;
  /** The MCP endpoint, `${origin}/mcp`. */
  url: string;
  call(name: string, args?: Record<string, unknown>): Promise<CallToolResult>;
  /** Another client on the same server, with its own key. */
  connectAs(apiKey: string, era?: Era): Promise<Client>;
  close(): Promise<void>;
}

/** The text of a result's first block (the summary) and the parsed second block (the JSON). */
export function textOf(result: CallToolResult): string {
  const block = result.content[0];
  return block?.type === 'text' ? block.text : '';
}

export function jsonOf(result: CallToolResult): unknown {
  const block = result.content[1];
  return block?.type === 'text' ? JSON.parse(block.text) : undefined;
}

async function mcpClient(url: string, apiKey: string, era: Era): Promise<Client> {
  const client = new Client(url, {
    auth: apiKey,
    versionNegotiation: { mode: era === 'modern' ? { pin: '2026-07-28' } : 'legacy' },
  });
  await client.connect();
  return client;
}

export async function connect(
  options: { era?: Era; logger?: Logger; apiKey?: string } = {}
): Promise<Harness> {
  const fetch = fakeFetch();
  const server = createHttpServer({
    url: BASE,
    fetch,
    logger: options.logger,
    logLevel: options.logger ? 'debug' : 'silent',
  });
  await serveHttp(server, { host: '127.0.0.1', port: 0, path: '/mcp' });
  const origin = `http://127.0.0.1:${server.address!.port}`;
  const url = `${origin}/mcp`;
  const clients: Client[] = [];
  const connectAs = async (apiKey: string, era: Era = options.era ?? 'legacy') => {
    const c = await mcpClient(url, apiKey, era);
    clients.push(c);
    return c;
  };
  const client = await connectAs(options.apiKey ?? API_KEY);
  return {
    fetch,
    client,
    origin,
    url,
    call: (name, args = {}) => client.callToolRaw(name, args),
    connectAs,
    close: async () => {
      await Promise.all(clients.map((c) => c.close()));
      await server.close();
    },
  };
}

test('the harness round-trips one tool call over HTTP', async () => {
  const h = await connect();
  h.fetch.reply([], null);
  const result = await h.call('list_senders');
  expect(textOf(result)).toBe('0 senders.');
  expect(jsonOf(result)).toEqual({ items: [], next_cursor: null });
  await h.close();
});
