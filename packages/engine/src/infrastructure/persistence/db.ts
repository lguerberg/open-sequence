import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import { schema } from './schema.js';

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = PgTransaction<PostgresJsQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;
/** A repository works the same on the pool or inside a transaction. */
export type DbOrTx = Db | Tx;

export interface DbHandle {
  db: Db;
  close(): Promise<void>;
}

export function connect(dsn: string, opts: { max?: number } = {}): DbHandle {
  const client = postgres(dsn, { max: opts.max ?? 10, onnotice: () => {}, prepare: false });
  return { db: drizzle(client, { schema }), close: () => client.end({ timeout: 5 }) };
}

/** Cursor pagination over ULID ids: the cursor is the last id seen. */
export function decodeCursor(cursor: string | null | undefined): string | null {
  if (!cursor) return null;
  try {
    return Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

export function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

export function page<T extends { id: string }>(rows: T[], limit: number): { items: T[]; nextCursor: string | null } {
  if (rows.length > limit) {
    const items = rows.slice(0, limit);
    return { items, nextCursor: encodeCursor(items[items.length - 1]!.id) };
  }
  return { items: rows, nextCursor: null };
}
