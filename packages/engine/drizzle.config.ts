import { defineConfig } from 'drizzle-kit';

// `pnpm db:generate` diffs src/infrastructure/persistence/schema.ts against the last snapshot and
// writes a SQL migration under drizzle/. The server applies them at boot (SEQ_RUN_MIGRATIONS=1)
// or `oseq migrate` does. Never edit a generated migration after it has been released.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infrastructure/persistence/schema.ts',
  out: './drizzle',
  schemaFilter: ['seq'],
  migrations: { schema: 'seq', table: 'migrations' },
  strict: true,
  verbose: true,
});
