/**
 * A throwaway Postgres for integration tests. Point SEQ_TEST_DB_DSN at any Postgres 14+; the
 * default is the local instance started by scripts/test-db.sh. Migrations run once per process;
 * every test file truncates the tables it touched.
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { schema } from '../infrastructure/persistence/schema.js';
import { runMigrations } from '../infrastructure/persistence/migrator.js';

export const TEST_DSN = process.env['SEQ_TEST_DB_DSN'] ?? 'postgres://oseq@127.0.0.1:54329/opensequence_test';

let client: ReturnType<typeof postgres> | undefined;
let migrated = false;

export function testDb() {
  client ??= postgres(TEST_DSN, { max: 4, onnotice: () => {} });
  return drizzle(client, { schema });
}

export async function migrateTestDb(): Promise<void> {
  if (migrated) return;
  await runMigrations(testDb());
  migrated = true;
}

export async function truncateAll(): Promise<void> {
  const db = testDb();
  await db.execute(sql`
    truncate table seq.webhook_deliveries, seq.signal_effects, seq.signals, seq.tasks, seq.messages, seq.runs,
      seq.enrollments, seq.suppressions, seq.versions, seq.sequences, seq.contacts,
      seq.sender_channels, seq.senders, seq.webhook_endpoints, seq.idempotency_keys, seq.api_keys, seq.flags,
      seq.projects, seq.queue_messages, seq.queue_dead restart identity cascade
  `);
}

export async function closeTestDb(): Promise<void> {
  await client?.end({ timeout: 2 });
  client = undefined;
}
