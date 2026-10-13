/**
 * The hosted server: Streamable HTTP, a project API key as the bearer of every request, and one SDK
 * client per call built from that key. Stateless, so any number of containers can share a balancer.
 */
import { OpenSequence } from '@opensequence/sdk';
import type { FetchLike } from '@opensequence/sdk';
import type { FastMCP, FrameworkLogLevel, Logger } from '@prefecthq/fastmcp-ts/server';
import { apiKeyVerifier } from './auth.js';
import { USER_AGENT, createServer, pinTransport } from './server.js';
import type { ToolDefinition } from './tool.js';

export const HEALTH_PATH = '/health';

export interface HttpServerOptions {
  /** OPENSEQUENCE_URL: the API every call is made against. */
  url: string;
  /** Replaces the global fetch for calls to the API. Tests inject one. */
  fetch?: FetchLike;
  tools?: readonly ToolDefinition[];
  logger?: Logger;
  logLevel?: FrameworkLogLevel;
}

export function createHttpServer(options: HttpServerOptions): FastMCP {
  const { url, fetch, ...rest } = options;
  return createServer({
    ...rest,
    auth: apiKeyVerifier(),
    client: (apiKey) => new OpenSequence({ baseUrl: url, apiKey, userAgent: USER_AGENT, fetch }),
  });
}

export interface HttpListen {
  host: string;
  /** 0 picks a free port; read it back from `server.address`. */
  port: number;
  path: string;
}

/** Starts listening. `/health` answers 200 without a key, for probes. */
export async function serveHttp(server: FastMCP, listen: HttpListen): Promise<void> {
  pinTransport('http');
  await server.run({
    transport: 'http',
    host: listen.host,
    port: listen.port,
    path: listen.path,
    stateless: true,
    health: { path: HEALTH_PATH },
  });
}
