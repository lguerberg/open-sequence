import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

/** Tests resolve workspace packages to their sources, so no build step is needed between edits. */
export const workspaceAliases = {
  '@opensequence/core': path.join(root, 'packages/core/src/index.ts'),
  '@opensequence/engine': path.join(root, 'packages/engine/src/index.ts'),
  '@opensequence/queue': path.join(root, 'packages/queue/src/index.ts'),
  '@opensequence/providers': path.join(root, 'packages/providers/src/index.ts'),
  '@opensequence/auth': path.join(root, 'packages/auth/src/index.ts'),
  '@opensequence/sdk': path.join(root, 'packages/sdk/src/index.ts'),
};
