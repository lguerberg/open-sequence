/**
 * @opensequence/mcp: OpenSequence as an MCP server, for coding agents and LLM agents.
 *
 *   // hosted: each caller's bearer key, one SDK client per call
 *   await serveHttp(createHttpServer({ url }), { host: '0.0.0.0', port: 8080, path: '/mcp' });
 *
 *   // local: one key from the environment
 *   await serveStdio(createStdioServer({ url, apiKey }));
 */
export {
  createServer,
  callTool,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  MCP_INSTRUCTIONS,
} from './server.js';
export type { CreateServerOptions, ClientSource, CallToolResult } from './server.js';
export { createHttpServer, serveHttp, HEALTH_PATH } from './http.js';
export type { HttpServerOptions, HttpListen } from './http.js';
export { createStdioServer, serveStdio } from './stdio.js';
export type { StdioServerOptions } from './stdio.js';
export { apiKeyVerifier, looksLikeApiKey } from './auth.js';
export { createLogger } from './logger.js';
export type { LogLevel } from './logger.js';
export { tools, toolNames } from './tools/index.js';
export { defineTool, ToolError } from './tool.js';
export type { ToolDefinition, ToolOutput, ToolScope } from './tool.js';
export { explainError } from './errors.js';
export type { ExplainedError } from './errors.js';
export { readConfig, readHttpConfig, readTransport, readLogLevel, ConfigError } from './config.js';
export type { McpConfig, HttpConfig, Transport } from './config.js';
