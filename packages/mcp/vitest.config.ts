import { defineConfig } from 'vitest/config';
import { workspaceAliases } from '../../vitest.shared.js';

export default defineConfig({
  resolve: { alias: workspaceAliases },
  test: { name: 'mcp', include: ['src/**/*.test.ts'], testTimeout: 30_000 },
});
