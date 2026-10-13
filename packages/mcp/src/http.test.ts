/**
 * The hosted transport: the health route, the bearer gate, plain JSON-RPC as a client sends it,
 * one SDK client per call with that call's key, both protocol eras, and logs without the key.
 */
import type { Logger } from '@prefecthq/fastmcp-ts/server';
import { afterEach, describe, expect, test } from 'vitest';
import { looksLikeApiKey } from './auth.js';
import { MCP_INSTRUCTIONS } from './server.js';
import { API_KEY, BASE, connect, jsonOf, textOf, type Harness } from './test-helpers.test.js';

let h: Harness | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
});

const INITIALIZE = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'raw-test', version: '0.0.0' },
  },
};

/** One JSON-RPC POST, as a Streamable HTTP client sends it. The answer may come as SSE or JSON. */
async function rpc(
  url: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<{
  status: number;
  headers: Headers;
  text: string;
  message?: { result?: unknown; error?: unknown };
}> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-11-25',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = res.headers.get('content-type')?.includes('text/event-stream')
    ? text
        .split('\n')
        .filter((l) => l.startsWith('data: '))
        .map((l) => l.slice(6))
        .pop()
    : text;
  let message: { result?: unknown; error?: unknown } | undefined;
  try {
    message = data ? JSON.parse(data) : undefined;
  } catch {
    message = undefined;
  }
  return { status: res.status, headers: res.headers, text, message };
}

describe('the bearer gate', () => {
  test('/health answers 200 without a key', async () => {
    h = await connect();
    const res = await fetch(`${h.origin}/health`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  test('no Authorization header is a 401, and nothing reaches the API', async () => {
    h = await connect();
    const res = await rpc(h.url, INITIALIZE);
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe('Bearer realm="mcp"');
    expect(JSON.parse(res.text)).toEqual({ error: 'Missing bearer token' });
    expect(h.fetch.calls).toHaveLength(0);
  });

  test('a bearer that is not an sk_ key is a 401 that does not echo it', async () => {
    h = await connect();
    const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJl';
    const res = await rpc(h.url, INITIALIZE, { authorization: `Bearer ${jwt}` });
    expect(res.status).toBe(401);
    expect(JSON.parse(res.text).error).toBe(
      'The bearer is not an OpenSequence API key. Send a project key: "Authorization: Bearer sk_live_…".'
    );
    expect(res.text).not.toContain(jwt);
    expect(h.fetch.calls).toHaveLength(0);
  });

  test('a key sent another way than Bearer is a 401', async () => {
    h = await connect();
    const res = await rpc(h.url, INITIALIZE, { authorization: `Basic ${API_KEY}` });
    expect(res.status).toBe(401);
  });

  test('looksLikeApiKey wants the sk_ prefix and nothing that cannot be in a key', () => {
    expect(looksLikeApiKey('sk_live_Ab-9_x')).toBe(true);
    expect(looksLikeApiKey('sk_')).toBe(false);
    expect(looksLikeApiKey('pk_live_x')).toBe(false);
    expect(looksLikeApiKey('sk_live x')).toBe(false);
    expect(looksLikeApiKey('Bearer sk_live_x')).toBe(false);
  });
});

describe('plain JSON-RPC with a key', () => {
  test('initialize, then tools/list: 19 tools, every input schema with its properties', async () => {
    h = await connect();
    const auth = { authorization: `Bearer ${API_KEY}` };
    const init = await rpc(h.url, INITIALIZE, auth);
    expect(init.status).toBe(200);
    expect(init.message?.result).toMatchObject({ serverInfo: { name: 'opensequence' } });

    const list = await rpc(
      h.url,
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      auth
    );
    expect(list.status).toBe(200);
    const tools = (
      list.message?.result as {
        tools: Array<{ name: string; inputSchema: { type: string; properties?: object } }>;
      }
    ).tools;
    expect(tools).toHaveLength(19);
    for (const t of tools) {
      expect(t.inputSchema.type, t.name).toBe('object');
      expect(Object.keys(t.inputSchema.properties ?? {}).length, t.name).toBeGreaterThan(0);
    }
    // Checking the bearer does not cost an API call: the API is asked only when a tool runs.
    expect(h.fetch.calls).toHaveLength(0);
  });

  test('tools/call carries the bearer key to the API', async () => {
    h = await connect();
    h.fetch.reply([], null);
    const call = await rpc(
      h.url,
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'list_senders', arguments: {} },
      },
      { authorization: `Bearer ${API_KEY}` }
    );
    expect(call.status).toBe(200);
    expect(h.fetch.last()).toMatchObject({
      method: 'GET',
      url: `${BASE}/v1/senders`,
      headers: { authorization: `Bearer ${API_KEY}`, 'user-agent': 'opensequence-mcp/0.1.0' },
    });
  });
});

describe('one SDK client per call', () => {
  test('two callers on one server each reach the API with their own key', async () => {
    h = await connect();
    const otherKey = 'sk_live_other_caller';
    const other = await h.connectAs(otherKey);
    h.fetch.reply([], null);
    h.fetch.reply([], null);
    await h.call('list_senders');
    await other.callToolRaw('list_senders', {});
    expect(h.fetch.calls.map((c) => c.headers['authorization'])).toEqual([
      `Bearer ${API_KEY}`,
      `Bearer ${otherKey}`,
    ]);
  });

  test('a well-formed key the API refuses passes the gate and comes back as the API answered', async () => {
    h = await connect({ apiKey: 'sk_live_revoked' });
    h.fetch.fail(401, { code: 'UNAUTHORIZED', message: 'This API key is not valid' });
    const result = await h.call('list_sequences');
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'UNAUTHORIZED: This API key is not valid. Check the project API key: OPENSEQUENCE_API_KEY for a local server, the Authorization header for a hosted one.'
    );
    expect(JSON.stringify(result)).not.toContain('sk_live_revoked');
  });
});

describe('protocol eras', () => {
  test('a 2026-07-28 client lists the same tools and gets the same answers', async () => {
    h = await connect({ era: 'modern' });
    expect(h.client.getProtocolEra()).toBe('modern');
    const tools = await h.client.listTools();
    expect(tools).toHaveLength(19);
    expect(
      Object.keys(tools.find((t) => t.name === 'enroll_contacts')!.inputSchema.properties ?? {})
    ).toContain('contacts');

    h.fetch.reply([], null);
    const result = await h.call('list_senders');
    expect(textOf(result)).toBe('0 senders.');
    expect(jsonOf(result)).toEqual({ items: [], next_cursor: null });
    expect(h.fetch.last().headers['authorization']).toBe(`Bearer ${API_KEY}`);
  });

  test('the harness default is the 2025 handshake', async () => {
    h = await connect();
    expect(h.client.getProtocolEra()).toBe('legacy');
  });
});

describe('the instructions resource', () => {
  test('what used to be the MCP instructions is readable as a resource', async () => {
    h = await connect();
    const resources = await h.client.listResources();
    expect(resources.map((r) => r.uri)).toEqual(['opensequence://instructions']);
    const [content] = await h.client.readResource('opensequence://instructions');
    expect(content && 'text' in content ? content.text : '').toBe(MCP_INSTRUCTIONS);
  });
});

describe('logs', () => {
  test('one line per call, with the tool and the outcome, never the key', async () => {
    const lines: Array<{ level: string; message: string; meta?: Record<string, unknown> }> = [];
    const capture: Logger = {
      debug: (message, meta) => lines.push({ level: 'debug', message, meta }),
      info: (message, meta) => lines.push({ level: 'info', message, meta }),
      warn: (message, meta) => lines.push({ level: 'warn', message, meta }),
      error: (message, meta) => lines.push({ level: 'error', message, meta }),
    };
    h = await connect({ logger: capture });
    h.fetch.reply([], null);
    await h.call('list_senders');
    h.fetch.fail(409, { code: 'ALREADY_IN_SEQUENCE', message: 'Already in a sequence.' });
    await h.call('enroll_contacts', { sequence: 'uk-intro', contacts: ['p_7'], sender: 'u_42' });

    expect(lines.find((l) => l.message === 'list_senders ok')?.meta).toMatchObject({
      tool: 'list_senders',
    });
    expect(
      lines.find((l) => l.message === 'enroll_contacts refused (ALREADY_IN_SEQUENCE)')?.meta
    ).toMatchObject({
      tool: 'enroll_contacts',
      code: 'ALREADY_IN_SEQUENCE',
      status: 409,
      request_id: 'req_err',
    });
    expect(JSON.stringify(lines)).not.toContain(API_KEY);
  });
});
