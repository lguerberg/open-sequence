import { defineConfig } from 'vitest/config';
import { workspaceAliases } from '../../vitest.shared.js';

export default defineConfig({
  resolve: { alias: workspaceAliases },
  test: { name: 'server', include: ['src/**/*.test.ts'], fileParallelism: false, testTimeout: 60_000, hookTimeout: 60_000 },
});
