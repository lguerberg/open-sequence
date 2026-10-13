/**
 * Applies the migrations drizzle-kit generated (drizzle/*.sql, listed in drizzle/meta/_journal.json)
 * in one transaction per migration, serialized by a row lock on auth.migration_lock, so replicas that
 * start together do not race and a transaction pooler is fine (no session-level locks). Applied
 * migrations are recorded in auth.migrations by tag and content hash; a changed file after release
 * is refused instead of silently re-run.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import type { AuthDb } from './db.js';

const MIGRATIONS_FOLDER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../drizzle');

interface Journal {
  entries: Array<{ idx: number; tag: string; when: number }>;
}

export interface MigrationLog {
  info(msg: string): void;
}

export async function runAuthMigrations(db: AuthDb, opts: { folder?: string; schema?: string; log?: MigrationLog } = {}): Promise<string[]> {
  const folder = opts.folder ?? MIGRATIONS_FOLDER;
  const schema = opts.schema ?? 'auth';
  const log = opts.log ?? { info: () => {} };
  const journal = JSON.parse(await readFile(path.join(folder, 'meta', '_journal.json'), 'utf8')) as Journal;

  await db.execute(sql.raw(`create schema if not exists "${schema}"`));
  await db.execute(
    sql.raw(`create table if not exists "${schema}".migrations (tag text primary key, hash text not null, applied_at timestamptz not null default now())`)
  );
  await db.execute(sql.raw(`create table if not exists "${schema}".migration_lock (id int primary key)`));
  await db.execute(sql.raw(`insert into "${schema}".migration_lock (id) values (1) on conflict do nothing`));

  const applied: string[] = [];
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const file = path.join(folder, `${entry.tag}.sql`);
    const text = await readFile(file, 'utf8');
    const hash = createHash('sha256').update(text).digest('hex');
    const statements = text
      .split(/-->\s*statement-breakpoint/g)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`select id from "${schema}".migration_lock where id = 1 for update`));
      const rows = await tx.execute<{ hash: string }>(sql.raw(`select hash from "${schema}".migrations where tag = '${entry.tag.replace(/'/g, "''")}'`));
      const existing = rows[0];
      if (existing) {
        if (existing.hash !== hash) {
          throw new Error(`migration ${entry.tag} was changed after it was applied (hash mismatch). Add a new migration instead.`);
        }
        return;
      }
      for (const statement of statements) await tx.execute(sql.raw(statement));
      await tx.execute(sql.raw(`insert into "${schema}".migrations (tag, hash) values ('${entry.tag.replace(/'/g, "''")}', '${hash}')`));
      applied.push(entry.tag);
      log.info(`applied migration ${entry.tag}`);
    });
  }
  return applied;
}
