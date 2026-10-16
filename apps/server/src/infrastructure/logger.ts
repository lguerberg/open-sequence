import { createRequire } from 'node:module';
import pino from 'pino';
import type { Logger as EngineLogger } from '@opensequence/engine';

/** pino-pretty is a dev dependency: the production image does not ship it, so a dev-mode container logs JSON. */
function prettyAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

export function createLogger(level: string, pretty: boolean): pino.Logger {
  pretty = pretty && prettyAvailable();
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
