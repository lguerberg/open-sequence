/**
 * The local transport: newline-delimited JSON-RPC over in-memory stdin and stdout streams, one key
 * from the configuration on every call.
 */
import { PassThrough } from 'node:stream';
import type { FastMCP } from '@prefecthq/fastmcp-ts/server';
import { afterEach, expect, test } from 'vitest';
import { createStdioServer, serveStdio } from './stdio.js';
import { API_KEY, BASE, fakeFetch } from './test-helpers.test.js';

let server: FastMCP | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

interface Message {
  id?: number;
  result?: Record<string, unknown>;
  error?: unknown;
}

function pipe() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const received: Message[] = [];
  const waiters = new Map<number, (m: Message) => void>();
  let buffer = '';
  stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const message = JSON.parse(line) as Message;
      received.push(message);
      if (message.id !== undefined) waiters.get(message.id)?.(message);
    }
  });
  let nextId = 1;
  return {
    stdin,
    stdout,
    received,
    request(method: string, params: unknown = {}): Promise<Message> {
      const id = nextId++;
      const answer = new Promise<Message>((resolve) => waiters.set(id, resolve));
      stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      return answer;
    },
    notify(method: string, params: unknown = {}): void {
      stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    },
  };
}

test('stdio: initialize, tools/list with full schemas, and a call made with the configured key', async () => {
  const fetch = fakeFetch();
  server = createStdioServer({ url: BASE, apiKey: API_KEY, fetch, logLevel: 'silent' });
  const io = pipe();
  await serveStdio(server, { stdin: io.stdin, stdout: io.stdout });

  const init = await io.request('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'stdio-test', version: '0.0.0' },
  });
  expect(init.result).toMatchObject({ serverInfo: { name: 'opensequence', version: '0.1.0' } });
  io.notify('notifications/initialized');

  const list = await io.request('tools/list');
  const tools = (
    list.result as { tools: Array<{ name: string; inputSchema: { properties?: object } }> }
  ).tools;
  expect(tools).toHaveLength(27);
  for (const t of tools)
    expect(Object.keys(t.inputSchema.properties ?? {}).length, t.name).toBeGreaterThan(0);

  fetch.reply([], null);
  const call = await io.request('tools/call', { name: 'list_senders', arguments: {} });
  expect(call.result).toMatchObject({
    content: [
      { type: 'text', text: '0 senders.' },
      { type: 'text', text: '{"items":[],"next_cursor":null}' },
    ],
  });
  expect(fetch.last().headers['authorization']).toBe(`Bearer ${API_KEY}`);
  // Nothing but protocol messages on stdout.
  expect(io.received.every((m) => (m as { jsonrpc?: string }).jsonrpc === '2.0')).toBe(true);
});
