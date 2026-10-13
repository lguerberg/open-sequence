/**
 * The CLI's configuration, read from the environment once at start. A bad value stops the process
 * with one line naming the variable. The key is never printed.
 *
 * Two modes:
 * - http (the default): the hosted server. Each caller sends its own key as a bearer; the server
 *   needs only where the API is and where to listen.
 * - stdio (`--stdio` or `MCP_TRANSPORT=stdio`): one local user, one key from OPENSEQUENCE_API_KEY.
 */
import type { LogLevel } from './logger.js';
import { LOG_LEVELS } from './logger.js';

export type Transport = 'stdio' | 'http';

/** stdio mode. */
export interface McpConfig {
  /** `https://sequences.example.com` (no trailing `/v1`). */
  url: string;
  /** A project API key. */
  apiKey: string;
}

/** http mode. */
export interface HttpConfig {
  /** The OpenSequence API every call goes to (OPENSEQUENCE_URL). */
  url: string;
  host: string;
  port: number;
  /** The path MCP clients are given, e.g. `/mcp`. */
  path: string;
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

type Env = Record<string, string | undefined>;

function readUrl(env: Env): string {
  const url = env['OPENSEQUENCE_URL']?.trim();
  if (!url)
    throw new ConfigError(
      'OPENSEQUENCE_URL is not set: give the address of your OpenSequence service, e.g. https://sequences.example.com.'
    );
  if (!/^https?:\/\//.test(url))
    throw new ConfigError(`OPENSEQUENCE_URL must start with http:// or https:// (got "${url}").`);
  return url;
}

export function readConfig(env: Env): McpConfig {
  const url = readUrl(env);
  const apiKey = env['OPENSEQUENCE_API_KEY']?.trim();
  if (!apiKey)
    throw new ConfigError(
      'OPENSEQUENCE_API_KEY is not set: give a project API key (sk_live_…); an "enroll"-scoped key suits agents.'
    );
  return { url, apiKey };
}

export function readHttpConfig(env: Env): HttpConfig {
  const url = readUrl(env);
  const host = env['HOST']?.trim() || '0.0.0.0';

  const rawPort = env['PORT']?.trim() || '8080';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || port > 65535)
    throw new ConfigError(`PORT must be a port number from 0 to 65535 (got "${rawPort}").`);

  const path = env['MCP_PATH']?.trim() || '/mcp';
  if (!path.startsWith('/')) throw new ConfigError(`MCP_PATH must start with "/" (got "${path}").`);

  return { url, host, port, path };
}

/**
 * `--stdio` or `--http` on the command line wins, then MCP_TRANSPORT, then http. An empty
 * MCP_TRANSPORT counts as unset.
 */
export function readTransport(argv: readonly string[], env: Env): Transport {
  if (argv.includes('--stdio')) return 'stdio';
  if (argv.includes('--http')) return 'http';
  const value = env['MCP_TRANSPORT']?.trim().toLowerCase();
  if (!value) return 'http';
  if (value === 'stdio' || value === 'http') return value;
  throw new ConfigError(`MCP_TRANSPORT must be "stdio" or "http" (got "${value}").`);
}

export function readLogLevel(env: Env): LogLevel {
  const value = env['LOG_LEVEL']?.trim().toLowerCase();
  if (!value) return 'info';
  if ((LOG_LEVELS as readonly string[]).includes(value)) return value as LogLevel;
  throw new ConfigError(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')} (got "${value}").`);
}
