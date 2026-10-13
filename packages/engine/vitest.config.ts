import { defineConfig } from 'vitest/config';
import { workspaceAliases } from '../../vitest.shared.js';

export default defineConfig({
  resolve: { alias: workspaceAliases },
  test: {
    name: 'engine',
    include: ['src/**/*.test.ts'],
    // Integration tests share one throwaway Postgres (see src/test/db.ts); run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
