import { createOpenAPI } from 'fumadocs-openapi/server';

/**
 * The OpenAPI server, server-side only. `generated/openapi.json` is a copy of
 * `apps/server/openapi.json` with the servers rewritten to a `{baseUrl}` variable, so the
 * playground asks the reader for their own instance instead of assuming one.
 */
export const openapi = createOpenAPI({
  input: ['./generated/openapi.json'],
});
