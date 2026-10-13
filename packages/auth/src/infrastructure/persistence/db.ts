import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/**
 * Any Drizzle database over postgres-js, whatever schema it was created with: the repositories use
 * the query builder with this package's own tables, never `db.query.*`, so the host can hand over
 * the connection it already has.
 */
export type AuthDb = PostgresJsDatabase<Record<string, unknown>>;
