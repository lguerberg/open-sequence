import { defineConfig } from 'vitest/config';
import { workspaceAliases } from '../../vitest.shared.js';

export default defineConfig({
  resolve: { alias: workspaceAliases },
  // Files run one at a time: rotateKeys re-encrypts every row in the shared test database, which
  // would break a file still writing rows under the previous key.
  test: { name: 'auth', include: ['src/**/*.test.ts'], testTimeout: 30_000, fileParallelism: false },
});
