/**
 * Structured JSON logs on stderr, in the shape FastMCP's `logger` option takes. stderr because on
 * stdio, stdout carries the protocol and anything else written there breaks the client.
 */
import type { Logger } from '@prefecthq/fastmcp-ts/server';
import { pino } from 'pino';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error', 'silent'];

export function createLogger(level: LogLevel = 'info'): Logger {
  const log = pino(
    {
      level,
      base: { service: 'opensequence-mcp' },
      timestamp: pino.stdTimeFunctions.isoTime,
      // Belt and braces: nothing here logs a key, but a framework error object might carry one.
      redact: {
        paths: ['token', 'apiKey', 'authorization', '*.token', '*.apiKey', '*.authorization'],
        censor: '[redacted]',
      },
    },
    pino.destination(2)
  );
  return {
    debug: (message, meta) => log.debug(meta ?? {}, message),
    info: (message, meta) => log.info(meta ?? {}, message),
    warn: (message, meta) => log.warn(meta ?? {}, message),
    error: (message, meta) => log.error(meta ?? {}, message),
  };
}
