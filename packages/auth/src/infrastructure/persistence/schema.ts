/**
 * The `seq_auth` schema (not `auth`, which Supabase and others reserve), the source of truth for migrations (`pnpm db:generate`).
 *
 * Same conventions as the engine's `seq` schema: text primary keys that are already the public id
 * (`cred_` and `con_` + ULID), `tenant_id` on every row, no foreign keys to any other schema,
 * `updated_at` on every mutable row. Secrets are AES-256-GCM ciphertext (base64) with the id of the
 * key that encrypted them beside, so keys can rotate.
 */
import { index, jsonb, pgSchema, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

export const auth = pgSchema('seq_auth');

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const created = () => ts('created_at').notNull().defaultNow();
const updated = () => ts('updated_at').notNull().defaultNow();

/** Tenant-level: the Google OAuth client, the Allo API key, the Attio API key. */
export const credentials = auth.table(
  'credentials',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    provider: varchar('provider', { length: 24 }).notNull(),
    /** oauth2 (the secret is a client secret) | api_key (the secret is a workspace key). */
    method: varchar('method', { length: 12 }).notNull(),
    status: varchar('status', { length: 12 }).notNull().default('active'),
    secretEnc: text('secret_enc').notNull(),
    keyId: varchar('key_id', { length: 16 }).notNull(),
    /** Verifies inbound webhooks for this tenant, when the provider signs them. */
    webhookSecretEnc: text('webhook_secret_enc'),
    /** Non-secret settings: client_id, pubsub_topic, the scopes a probe reported. */
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex('credentials_tenant_provider_idx').on(t.tenantId, t.provider)]
);

/** Owner-level, OAuth providers only: one authorized account (a Gmail address) per owner and provider. */
export const connections = auth.table(
  'connections',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    /** Opaque to auth (a sender id for sequences, a user id elsewhere). */
    ownerId: text('owner_id').notNull(),
    provider: varchar('provider', { length: 24 }).notNull(),
    /** The account at the provider; null until consent completes. */
    account: text('account'),
    scopes: text('scopes').array().notNull().default([]),
    /** The refresh token; null while pending and after disconnect. */
    secretEnc: text('secret_enc'),
    keyId: varchar('key_id', { length: 16 }),
    status: varchar('status', { length: 24 }).notNull().default('pending'),
    /** Adapter state that belongs with the account: history cursors, sync tokens, watch expiries. */
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    lastOkAt: ts('last_ok_at'),
    lastError: text('last_error'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex('connections_owner_provider_idx').on(t.ownerId, t.provider), index('connections_tenant_idx').on(t.tenantId)]
);

export const schema = { credentials, connections };
