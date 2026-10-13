import { defineConfig } from 'drizzle-kit';

// `pnpm db:generate` diffs src/infrastructure/persistence/schema.ts against the last snapshot and
// writes a SQL migration under drizzle/. The host applies them at boot with runAuthMigrations.
// Never edit a generated migration after it has been released.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infrastructure/persistence/schema.ts',
  out: './drizzle',
  schemaFilter: ['auth'],
  migrations: { schema: 'auth', table: 'migrations' },
  strict: true,
  verbose: true,
});
