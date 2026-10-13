/** Prints the OpenAPI document the routes describe, for the SDK and the docs: `pnpm --filter @opensequence/server openapi`. */
import { createMockProviders } from '@opensequence/providers';
import { buildApp } from './http/app.js';
import { createLogger } from './infrastructure/logger.js';
import type { Runtime } from './bootstrap.js';
import { loadEnv } from './config/env.js';

async function main() {
  const env = loadEnv({ SEQ_DB_DSN: 'postgres://unused', SEQ_ENCRYPTION_KEYS: 'x:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', SEQ_ADMIN_TOKEN: 'x', SEQ_DEV_MOCK_PROVIDERS: '1', SEQ_ROLES: 'api' });
  const log = createLogger('silent', false);
  const mock = createMockProviders();
  // Routes only need the context shape to register; nothing is called.
  const rt = { env, deps: {} as Runtime['deps'], auth: {} as Runtime['auth'], mock: mock.mock, db: {} as Runtime['db'], optOutSecret: 'x', close: async () => {} } as Runtime;
  const app = await buildApp(rt, log);
  await app.ready();
  process.stdout.write(JSON.stringify(app.swagger(), null, 2));
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
