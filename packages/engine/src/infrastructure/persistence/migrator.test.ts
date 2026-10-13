import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeTestDb, migrateTestDb, testDb } from '../../test/db.js';

describe('migrations', () => {
  afterAll(closeTestDb);

  it('apply, and apply again as a no-op', async () => {
    await migrateTestDb();
    const db = testDb();
    const tables = await db.execute<{ table_name: string }>(sql`select table_name from information_schema.tables where table_schema = 'seq' order by 1`);
    const names = tables.map((r) => r.table_name);
    expect(names).toEqual(expect.arrayContaining(['projects', 'enrollments', 'runs', 'signals', 'tasks', 'queue_messages', 'job_locks', 'migrations']));
    const jobs = await db.execute<{ job: string }>(sql`select job from seq.job_locks order by 1`);
    expect(jobs.map((r) => r.job)).toEqual(['plan', 'poll', 'reap', 'retention', 'signals', 'webhooks']);
    // second run must not throw or duplicate anything
    const { runMigrations } = await import('./migrator.js');
    await runMigrations(db);
  });

  it('refuses to edit a published definition', async () => {
    const db = testDb();
    await db.execute(sql`insert into seq.projects (id, slug, name) values ('prj_t', 'tt', 'T') on conflict do nothing`);
    await db.execute(sql`insert into seq.sequences (id, project_id, name) values ('seq_t', 'prj_t', 'T') on conflict do nothing`);
    await db.execute(sql`insert into seq.versions (id, project_id, sequence_id, tag, status, definition) values ('ver_t', 'prj_t', 'seq_t', 'v1', 'published', '{"a":1}') on conflict do nothing`);
    await expect(db.execute(sql`update seq.versions set definition = '{"a":2}' where id = 'ver_t'`)).rejects.toMatchObject({
      cause: { message: expect.stringContaining('cannot be edited') },
    });
    await db.execute(sql`delete from seq.projects where id = 'prj_t'`);
  });
});
