import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeTestDb, migrateTestDb, testDb } from '../../test/db.js';
import { runAuthMigrations } from './migrator.js';

describe('auth migrations', () => {
  afterAll(closeTestDb);

  it('apply, and apply again as a no-op', async () => {
    await migrateTestDb();
    const db = testDb();
    const tables = await db.execute<{ table_name: string }>(sql`select table_name from information_schema.tables where table_schema = 'auth' order by 1`);
    expect(tables.map((r) => r.table_name)).toEqual(expect.arrayContaining(['credentials', 'connections', 'migrations', 'migration_lock']));
    await runAuthMigrations(db);
  });
});
