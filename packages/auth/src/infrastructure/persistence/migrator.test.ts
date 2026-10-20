import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ulid } from 'ulid';
import { afterAll, describe, expect, it } from 'vitest';
import { closeTestDb, migrateTestDb, TEST_DSN, testDb } from '../../test/db.js';
import { runAuthMigrations } from './migrator.js';

const INIT_SQL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../drizzle/0000_init.sql');

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

  it('moves an install from before the rename out of the auth schema, keeping its rows', async () => {
    await withFreshDb(async (db) => {
      // The pre-rename state: 0000_init applied in `auth` and recorded under the old file's hash.
      const legacy = (await readFile(INIT_SQL, 'utf8')).replaceAll('"seq_auth"', '"auth"');
      for (const s of legacy.split(/-->\s*statement-breakpoint/g).filter((x) => x.trim())) await db.execute(sql.raw(s));
      const oldHash = createHash('sha256').update(legacy).digest('hex');
      await db.execute(sql.raw(`create table auth.migrations (tag text primary key, hash text not null, applied_at timestamptz not null default now())`));
      await db.execute(sql.raw(`create table auth.migration_lock (id int primary key); insert into auth.migration_lock values (1)`));
      await db.execute(sql.raw(`insert into auth.migrations (tag, hash) values ('0000_init', '${oldHash}')`));
      await db.execute(sql.raw(`insert into auth.credentials (id, tenant_id, provider, method, secret_enc, key_id) values ('cred_1', 't1', 'allo', 'api_key', 'x', 'k1')`));

      expect(await runAuthMigrations(db)).toEqual([]);
      const schemas = await db.execute<{ n: number }>(sql`select count(*)::int as n from pg_namespace where nspname = 'auth'`);
      expect(schemas[0]?.n).toBe(0);
      const rows = await db.execute<{ id: string }>(sql`select id from seq_auth.credentials`);
      expect(rows.map((r) => r.id)).toEqual(['cred_1']);
      expect(await runAuthMigrations(db)).toEqual([]);
    });
  });
});
