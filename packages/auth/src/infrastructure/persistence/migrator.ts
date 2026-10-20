/**
 * Applies the migrations drizzle-kit generated (drizzle/*.sql, listed in drizzle/meta/_journal.json)
 * in one transaction per migration, serialized by a row lock on seq_auth.migration_lock, so replicas that
 * start together do not race and a transaction pooler is fine (no session-level locks). Applied
 * migrations are recorded in seq_auth.migrations by tag and content hash; a changed file after release
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
  const schema = opts.schema ?? 'seq_auth';
  const log = opts.log ?? { info: () => {} };
  const journal = JSON.parse(await readFile(path.join(folder, 'meta', '_journal.json'), 'utf8')) as Journal;
  if (schema === 'seq_auth') await adoptLegacySchema(db, folder, log);

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

const LEGACY_TABLES = ['connections', 'credentials', 'migrations', 'migration_lock'];

/**
 * Before 0.1.0 the tables lived in a schema named `auth`, which clashes with Supabase's own. An
 * install from then has `auth.migration_lock` (a table only OpenSequence creates) and no `seq_auth`:
 * move its four tables across, keep 0000_init recorded under the renamed file's hash, and drop
 * `auth` only if nothing else is left in it.
 */
async function adoptLegacySchema(db: AuthDb, folder: string, log: MigrationLog): Promise<void> {
  const rows = await db.execute<{ legacy: string | null; current: string | null }>(
    sql.raw(`select to_regclass('auth.migration_lock')::text as legacy, to_regnamespace('seq_auth')::text as current`)
  );
  if (!rows[0]?.legacy || rows[0].current) return;
  const init = await readFile(path.join(folder, '0000_init.sql'), 'utf8');
  const hash = createHash('sha256').update(init).digest('hex');
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw('create schema "seq_auth"'));
    for (const table of LEGACY_TABLES) await tx.execute(sql.raw(`alter table if exists "auth"."${table}" set schema "seq_auth"`));
    await tx.execute(sql.raw(`update "seq_auth".migrations set hash = '${hash}' where tag = '0000_init'`));
  });
  try {
    await db.execute(sql.raw('drop schema "auth" restrict'));
  } catch {
    // Something else lives in `auth`; leave it.
  }
  log.info('moved the auth tables to the seq_auth schema');
}
