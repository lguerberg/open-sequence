import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ulid } from 'ulid';
import { afterAll, describe, expect, it } from 'vitest';
import { closeTestDb, migrateTestDb, TEST_DSN, testDb } from '../../test/db.js';
import { runAuthMigrations } from './migrator.js';

/** A fresh database for one test, dropped afterwards. */
async function withFreshDb(run: (db: ReturnType<typeof drizzle>) => Promise<void>): Promise<void> {
  const name = `oseq_auth_${ulid().toLowerCase()}`;
  const admin = postgres(TEST_DSN, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database ${name}`);
  const client = postgres(TEST_DSN.replace(/\/[^/]+$/, `/${name}`), { max: 2, onnotice: () => {} });
  try {
    await run(drizzle(client));
  } finally {
    await client.end({ timeout: 2 });
    await admin.unsafe(`drop database ${name}`);
    await admin.end({ timeout: 2 });
  }
}

const tablesIn = async (db: ReturnType<typeof drizzle>, schema: string) =>
  (await db.execute<{ table_name: string }>(sql`select table_name from information_schema.tables where table_schema = ${schema} order by 1`)).map((r) => r.table_name);

describe('auth migrations', () => {
  afterAll(closeTestDb);

  it('apply, and apply again as a no-op', async () => {
    await migrateTestDb();
    const db = testDb();
    expect(await tablesIn(db, 'seq_auth')).toEqual(expect.arrayContaining(['credentials', 'connections', 'migrations', 'migration_lock']));
    expect(await runAuthMigrations(db)).toEqual([]);
  });

  it("leaves another product's auth schema alone, as on Supabase", async () => {
    await withFreshDb(async (db) => {
      await db.execute(sql.raw('create schema auth; create table auth.users (id int primary key)'));
      await runAuthMigrations(db);
      expect(await tablesIn(db, 'auth')).toEqual(['users']);
      expect(await tablesIn(db, 'seq_auth')).toEqual(['connections', 'credentials', 'migration_lock', 'migrations']);
    });
  });

});
