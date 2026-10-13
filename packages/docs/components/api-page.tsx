'use client';
import { createOpenAPIPage } from 'fumadocs-openapi/ui';

/**
 * The API reference page: method badge, path, parameters, request and response schemas, code
 * samples per language and the "try it" playground. The playground's base URL is a server
 * variable the reader fills in with their own instance.
 */
export const OpenAPIPage = createOpenAPIPage({
  storageKeyPrefix: 'oseq-docs-',
  showResponseSchema: true,
});
