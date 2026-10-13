/**
 * The local server: stdio, one user, one key from the environment. This is what an MCP client
 * starts with `npx -y @opensequence/mcp --stdio`.
 */
import type { Readable, Writable } from 'node:stream';
import { OpenSequence } from '@opensequence/sdk';
import type { FetchLike } from '@opensequence/sdk';
import type { FastMCP, FrameworkLogLevel, Logger } from '@prefecthq/fastmcp-ts/server';
import { USER_AGENT, createServer, pinTransport } from './server.js';
import type { ToolDefinition } from './tool.js';

export interface StdioServerOptions {
  /** OPENSEQUENCE_URL. */
  url: string;
  /** OPENSEQUENCE_API_KEY: every call is made with it. */
  apiKey: string;
  /** Replaces the global fetch for calls to the API. Tests inject one. */
  fetch?: FetchLike;
  tools?: readonly ToolDefinition[];
  logger?: Logger;
  logLevel?: FrameworkLogLevel;
}

export function createStdioServer(options: StdioServerOptions): FastMCP {
  const { url, apiKey, fetch, ...rest } = options;
  return createServer({
    ...rest,
    client: new OpenSequence({ baseUrl: url, apiKey, userAgent: USER_AGENT, fetch }),
  });
}

/** Defaults to the process's stdin and stdout. Nothing else may write to stdout. */
export async function serveStdio(
  server: FastMCP,
  streams: { stdin?: Readable; stdout?: Writable } = {}
): Promise<void> {
  pinTransport('stdio');
  await server.run({ transport: 'stdio', ...streams });
}
