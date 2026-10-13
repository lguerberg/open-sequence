/**
 * A throwaway Postgres for integration tests, shared with the other packages' suites: never
 * truncate, and give every test its own tenant and owner ids (see `uniq`).
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { ulid } from 'ulid';
import { runAuthMigrations } from '../infrastructure/persistence/migrator.js';

export const TEST_DSN = process.env['SEQ_TEST_DB_DSN'] ?? 'postgres://oseq@127.0.0.1:54329/opensequence_test';

let client: ReturnType<typeof postgres> | undefined;
let migrated = false;

export function testDb() {
  client ??= postgres(TEST_DSN, { max: 4, onnotice: () => {} });
  return drizzle(client);
}

export async function migrateTestDb(): Promise<void> {
  if (migrated) return;
  await runAuthMigrations(testDb());
  migrated = true;
}

export async function closeTestDb(): Promise<void> {
  await client?.end({ timeout: 2 });
  client = undefined;
}

export const uniq = (prefix: string) => `${prefix}_${ulid()}`;

/** Two deterministic 32-byte keys, as SEQ_ENCRYPTION_KEYS entries. */
export const KEY_A = `ka:${Buffer.alloc(32, 1).toString('base64')}`;
export const KEY_B = `kb:${Buffer.alloc(32, 2).toString('base64')}`;
