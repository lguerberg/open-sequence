import pino from 'pino';
import type { Logger as EngineLogger } from '@opensequence/engine';

export function createLogger(level: string, pretty: boolean): pino.Logger {
  return pino({
    level,
    redact: { paths: ['req.headers.authorization', '*.api_key', '*.client_secret', '*.secret', '*.refresh_token', '*.password', '*.*.password', '*.*.*.password', '*.smtp_password', '*.imap_password'], censor: '[redacted]' },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } } : {}),
  });
}

/** The engine's small logger interface, over pino. */
export function engineLogger(log: pino.Logger): EngineLogger {
  return {
    info: (obj, msg) => log.info(obj, msg),
    warn: (obj, msg) => log.warn(obj, msg),
    error: (obj, msg) => log.error(obj, msg),
    debug: (obj, msg) => log.debug(obj, msg),
  };
}
