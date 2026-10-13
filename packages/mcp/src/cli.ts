#!/usr/bin/env node
/**
 * `opensequence-mcp`: the OpenSequence MCP server.
 *
 * Hosted (the default; what the Docker image runs). Each caller sends its own project key as
 * `Authorization: Bearer sk_live_…`:
 *
 *   OPENSEQUENCE_URL=https://sequences.example.com PORT=8080 opensequence-mcp
 *
 * Local, over stdio, for an MCP client on your machine:
 *
 *   OPENSEQUENCE_URL=https://sequences.example.com OPENSEQUENCE_API_KEY=sk_live_… npx -y @opensequence/mcp --stdio
 *
 * Every tool is registered either way. The key's scopes decide what succeeds: with a `read` key
 * the write tools fail with the API's own 403 message. Logs go to stderr, as JSON.
 */
import { ConfigError, readConfig, readHttpConfig, readLogLevel, readTransport } from './config.js';
import { createHttpServer, serveHttp } from './http.js';
import { createLogger } from './logger.js';
import { MCP_SERVER_VERSION } from './server.js';
import { createStdioServer, serveStdio } from './stdio.js';

async function main(): Promise<void> {
  const transport = readTransport(process.argv.slice(2), process.env);
  const logLevel = readLogLevel(process.env);
  const logger = createLogger(logLevel);

  if (transport === 'stdio') {
    const config = readConfig(process.env);
    await serveStdio(createStdioServer({ ...config, logger, logLevel }));
    logger.info(`OpenSequence MCP server ${MCP_SERVER_VERSION} on stdio`, { api: config.url });
    return;
  }

  const config = readHttpConfig(process.env);
  if (process.env['OPENSEQUENCE_API_KEY']) {
    logger.warn(
      'OPENSEQUENCE_API_KEY is set but unused over HTTP, where each caller sends its own key. Pass --stdio to run locally with it.'
    );
  }
  const server = createHttpServer({ url: config.url, logger, logLevel });
  await serveHttp(server, config);
  logger.info(`OpenSequence MCP server ${MCP_SERVER_VERSION} on HTTP`, {
    port: server.address?.port ?? config.port,
    path: config.path,
    api: config.url,
  });
}

main().catch((err: unknown) => {
  const message =
    err instanceof ConfigError
      ? err.message
      : `failed to start: ${err instanceof Error ? err.message : String(err)}`;
  process.stderr.write(`opensequence-mcp: ${message}\n`);
  process.exit(1);
});
