// Boundaries are the architecture. Two rules, enforced on every import:
//
//   1. Layers inside a package: infrastructure -> application -> domain, never the reverse.
//      domain imports nothing from application or infrastructure; application imports domain only.
//   2. Packages: core is pure (no I/O packages at all); engine depends on core; queue, providers and
//      auth implement core's ports and never import engine; server is the only composition root.
//
// A violation is a lint error, not a review comment.
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/drizzle/**', '**/*.config.*', 'packages/sdk/src/generated/**', 'packages/docs/.next/**', 'packages/docs/.source/**', 'packages/docs/out/**', 'packages/docs/generated/**', 'apps/site/.next/**', 'apps/site/out/**', 'apps/site/next-env.d.ts'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'domain', pattern: 'packages/*/src/domain/**', mode: 'full' },
        { type: 'application', pattern: 'packages/*/src/application/**', mode: 'full' },
        { type: 'infrastructure', pattern: 'packages/*/src/infrastructure/**', mode: 'full' },
        { type: 'server', pattern: 'apps/server/src/**', mode: 'full' },
      ],
      'boundaries/ignore': ['**/*.test.ts', '**/*.spec.ts', '**/test/**'],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'domain', allow: ['domain'] },
            { from: 'application', allow: ['domain', 'application'] },
            { from: 'infrastructure', allow: ['domain', 'application', 'infrastructure'] },
            { from: 'server', allow: ['domain', 'application', 'infrastructure', 'server'] },
          ],
        },
      ],
      'boundaries/no-unknown-files': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // core is pure: it may not import anything that does I/O.
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:fs', 'node:http', 'node:https', 'node:net', 'node:child_process'], message: 'core is pure' },
            { group: ['postgres', 'drizzle-orm', 'drizzle-orm/*', 'ioredis', 'googleapis', 'fastify'], message: 'core is pure' },
            { group: ['@opensequence/*'], message: 'core depends on nothing' },
          ],
        },
      ],
    },
  },
  {
    // the SDK is what clients install: it shares no code with the service, only the OpenAPI contract.
    files: ['packages/sdk/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@opensequence/*'], message: 'the SDK depends on nothing in this repository' }] }],
    },
  },
  {
    // the MCP server is an API client like any other: it reaches the service through the SDK only.
    files: ['packages/mcp/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@opensequence/*', '!@opensequence/sdk'], message: 'the MCP server depends on @opensequence/sdk only' }] }],
    },
  },
  {
    // adapters implement core's ports and must not reach into the engine or the server.
    files: ['packages/{queue,providers,auth}/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@opensequence/engine', '@opensequence/engine/*', '@opensequence/server'], message: 'adapters depend on core only' }] },
      ],
    },
  }
);
