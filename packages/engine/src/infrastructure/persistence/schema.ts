/**
 * The `seq` schema, the source of truth for migrations (`pnpm db:generate`).
 *
 * Conventions (docs/ARCHITECTURE.md section 4): text primary keys that are already the public id
 * (prefix + ULID), `project_id` on every tenant-owned table and on every unique index that could
 * collide across projects, no foreign keys to any client table, `updated_at` on every mutable row.
 * Credentials and connections live in the `seq_auth` schema owned by @opensequence/auth.
 */
import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgSchema, smallint, text, timestamp, uniqueIndex, varchar, bigserial, bigint } from 'drizzle-orm/pg-core';

export const seq = pgSchema('seq');

// ------------------------------------------------------------------ enums
export const sequenceStatus = seq.enum('sequence_status', ['active', 'paused', 'archived']);
export const versionStatus = seq.enum('version_status', ['draft', 'published', 'archived']);
export const enrollmentStatus = seq.enum('enrollment_status', ['active', 'paused', 'waiting_limit', 'completed', 'exited', 'failed']);
export const runStatus = seq.enum('run_status', ['running', 'waiting', 'done', 'deferred', 'skipped', 'failed', 'needs_review', 'skipped_dry_run']);
export const signalKind = seq.enum('signal_kind', [
  'reply',
  'bounce',
  'complaint',
  'opt_out',
  'ooo',
  'task_completed',
  'call_connected',
  'meeting_booked',
  'sender_channel_status',
  'contact_suppressed',
  'crm_changed',
]);

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const created = () => ts('created_at').notNull().defaultNow();
const updated = () => ts('updated_at').notNull().defaultNow();

// ------------------------------------------------------------------ projects, keys, endpoints
export interface ProjectSettings {
  attribution_days?: number;
  sms_countries?: string[];
  send_window?: { days: string[]; from: string; to: string; tz: 'contact' | 'sender' };
  attrs_schema?: Record<string, { type: string; label?: string; values?: string[] }>;
  retention_days?: number;
  store_inbound_bodies?: boolean;
  match_replies_outside_thread?: boolean;
  meeting_detection?: 'calendar' | 'client' | 'both';
  crm?: { deal_selection?: 'newest_open' | 'highest_value' | 'any_open' };
  allo?: { outcome_map?: Record<string, string> };
  max_steps_per_tick?: number;
  mock?: Record<string, unknown>;
}

export const projects = seq.table('projects', {
  id: text('id').primaryKey(),
  slug: varchar('slug', { length: 48 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  settings: jsonb('settings').$type<ProjectSettings>().notNull().default({}),
  createdAt: created(),
  updatedAt: updated(),
});

export const apiKeys = seq.table(
  'api_keys',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    keyHash: text('key_hash').notNull().unique(),
    prefix: varchar('prefix', { length: 12 }).notNull(),
    scopes: text('scopes').array().notNull(),
    lastUsedAt: ts('last_used_at'),
    revokedAt: ts('revoked_at'),
    createdAt: created(),
  },
  (t) => [index('api_keys_project_idx').on(t.projectId)]
);

export const webhookEndpoints = seq.table(
  'webhook_endpoints',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    secretEnc: text('secret_enc').notNull(),
    keyId: varchar('key_id', { length: 16 }).notNull(),
    eventTypes: text('event_types').array().notNull(),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    disabledReason: text('disabled_reason'),
    disabledAt: ts('disabled_at'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('webhook_endpoints_project_idx').on(t.projectId)]
);

export const idempotencyKeys = seq.table(
  'idempotency_keys',
  {
    projectId: text('project_id').notNull(),
    key: varchar('key', { length: 128 }).notNull(),
    requestHash: text('request_hash').notNull(),
    statusCode: smallint('status_code').notNull(),
    response: jsonb('response').notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex('idempotency_keys_pk').on(t.projectId, t.key)]
);

// ------------------------------------------------------------------ senders and contacts
export const senders = seq.table(
  'senders',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    externalId: varchar('external_id', { length: 64 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    email: varchar('email', { length: 320 }),
    timezone: varchar('timezone', { length: 48 }).notNull().default('UTC'),
    status: text('status').notNull().default('active'),
    attrs: jsonb('attrs').$type<Record<string, unknown>>().notNull().default({}),
    // The email signature, sanitized HTML and its plain-text twin; `{{ sender.signature }}` renders one or the other.
    signatureHtml: text('signature_html'),
    signatureText: text('signature_text'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex('senders_external_idx').on(t.projectId, t.externalId)]
);

export const senderChannels = seq.table(
  'sender_channels',
  {
    id: text('id').primaryKey(),
    senderId: text('sender_id')
      .notNull()
      .references(() => senders.id, { onDelete: 'cascade' }),
    projectId: text('project_id').notNull(),
    /** seq_auth.connections.id for OAuth channels (email); null for sms (API key). No cross-schema FK. */
    connectionId: text('connection_id'),
    channel: varchar('channel', { length: 16 }).notNull(),
    address: text('address').notNull(),
    status: varchar('status', { length: 24 }).notNull().default('pending'),
    dailyLimit: integer('daily_limit'),
    weeklyLimit: integer('weekly_limit'),
    minGapSeconds: integer('min_gap_seconds').notNull().default(0),
    optedInAt: ts('opted_in_at'),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex('sender_channels_sender_channel_idx').on(t.senderId, t.channel), index('sender_channels_address_idx').on(t.projectId, t.channel, t.address)]
);

export const contacts = seq.table(
  'contacts',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    externalId: varchar('external_id', { length: 64 }).notNull(),
    firstName: varchar('first_name', { length: 120 }),
    lastName: varchar('last_name', { length: 120 }),
    email: varchar('email', { length: 320 }),
    phone: varchar('phone', { length: 24 }),
    country: varchar('country', { length: 2 }),
    timezone: varchar('timezone', { length: 48 }),
    smsConsent: boolean('sms_consent').notNull().default(false),
    smsConsentAt: ts('sms_consent_at'),
    smsConsentSource: text('sms_consent_source'),
    attrs: jsonb('attrs').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex('contacts_external_idx').on(t.projectId, t.externalId),
    index('contacts_email_idx').on(t.projectId, sql`lower(${t.email})`),
    index('contacts_phone_idx').on(t.projectId, t.phone),
    index('contacts_updated_idx').on(t.projectId, t.updatedAt),
  ]
);

export const suppressions = seq.table(
  'suppressions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    projectId: text('project_id').notNull(),
    contactId: text('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    channel: varchar('channel', { length: 16 }).notNull(),
    reason: varchar('reason', { length: 24 }).notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex('suppressions_contact_channel_idx').on(t.contactId, t.channel)]
);

// ------------------------------------------------------------------ sequences and versions
export const sequences = seq.table(
  'sequences',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    externalId: varchar('external_id', { length: 64 }),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    createdBy: varchar('created_by', { length: 64 }),
    labels: jsonb('labels').$type<Record<string, unknown>>().notNull().default({}),
    status: sequenceStatus('status').notNull().default('active'),
    /** FK added after versions exists (circular). */
    defaultVersionId: text('default_version_id'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex('sequences_name_idx')
      .on(t.projectId, sql`lower(${t.name})`)
      .where(sql`${t.status} <> 'archived'`),
  ]
);

export const versions = seq.table(
  'versions',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    sequenceId: text('sequence_id')
      .notNull()
      .references(() => sequences.id, { onDelete: 'cascade' }),
    tag: varchar('tag', { length: 24 }).notNull(),
    status: versionStatus('status').notNull().default('draft'),
    definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
    schemaVersion: integer('schema_version').notNull().default(1),
    lockVersion: integer('lock_version').notNull().default(0),
    basedOnVersionId: text('based_on_version_id'),
    createdBy: varchar('created_by', { length: 64 }),
    publishedBy: varchar('published_by', { length: 64 }),
    publishedAt: ts('published_at'),
    archivedAt: ts('archived_at'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex('versions_sequence_tag_idx').on(t.sequenceId, t.tag)]
);

// ------------------------------------------------------------------ enrollments and runs
export const enrollments = seq.table(
  'enrollments',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    sequenceId: text('sequence_id')
      .notNull()
      .references(() => sequences.id),
    versionId: text('version_id')
      .notNull()
      .references(() => versions.id),
    contactId: text('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    senderId: text('sender_id')
      .notNull()
      .references(() => senders.id),
    enrolledBy: varchar('enrolled_by', { length: 64 }),
    enrolledByKind: text('enrolled_by_kind').notNull().default('user'),
    mode: text('mode').notNull().default('live'),
    status: enrollmentStatus('status').notNull().default('active'),
    currentNodeId: varchar('current_node_id', { length: 64 }).notNull(),
    /** The timer. NULL while an executor owns the step, or while waiting on an event with no timeout. */
    nextRunAt: ts('next_run_at'),
    /** The running run that owns this enrollment, if any (section 6.2). */
    ownerRunId: text('owner_run_id'),
    /** For a waiting step: the events it waits for and where each leads, plus the timeout target. */
    waiting: jsonb('waiting').$type<{ runId: string; events: Record<string, string>; onTimeout?: string } | null>(),
    pausedUntil: ts('paused_until'),
    pauseReason: text('pause_reason'),
    exitReason: text('exit_reason'),
    exitSignalId: text('exit_signal_id'),
    repliedAt: ts('replied_at'),
    repliedChannel: varchar('replied_channel', { length: 16 }),
    meetingBookedAt: ts('meeting_booked_at'),
    meetingChannel: varchar('meeting_channel', { length: 16 }),
    touchCount: smallint('touch_count').notNull().default(0),
    lastTouchAt: ts('last_touch_at'),
    /** Per-enrollment event counter carried by outbound webhooks. */
    seq: integer('seq').notNull().default(0),
    enrolledAt: ts('enrolled_at').notNull().defaultNow(),
    finishedAt: ts('finished_at'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex('enrollments_one_active_idx')
      .on(t.projectId, t.contactId)
      .where(sql`${t.status} in ('active','paused','waiting_limit')`),
    index('enrollments_due_idx')
      .on(t.senderId, t.nextRunAt)
      .where(sql`${t.status} = 'active' and ${t.nextRunAt} is not null`),
    index('enrollments_seq_idx').on(t.sequenceId, t.status),
    index('enrollments_contact_idx').on(t.contactId, t.finishedAt),
    index('enrollments_contact_touch_idx').on(t.contactId, t.lastTouchAt),
    index('enrollments_paused_idx')
      .on(t.pausedUntil)
      .where(sql`${t.status} = 'paused' and ${t.pausedUntil} is not null`),
    index('enrollments_project_updated_idx').on(t.projectId, t.updatedAt),
  ]
);

export const runs = seq.table(
  'runs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    enrollmentId: text('enrollment_id')
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    sequenceId: text('sequence_id').notNull(),
    versionId: text('version_id').notNull(),
    nodeId: varchar('node_id', { length: 64 }).notNull(),
    nodeType: varchar('node_type', { length: 32 }).notNull(),
    channel: varchar('channel', { length: 16 }),
    action: varchar('action', { length: 24 }),
    touchNumber: smallint('touch_number'),
    attempt: smallint('attempt').notNull().default(1),
    status: runStatus('status').notNull(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    /** The node's transitions, copied so an executor can follow sent/skipped/failed without the definition. */
    next: jsonb('next').$type<Record<string, string>>().notNull().default({}),
    startedAt: ts('started_at'),
    finishedAt: ts('finished_at'),
    provider: varchar('provider', { length: 24 }),
    providerRef: text('provider_ref'),
    threadRef: text('thread_ref'),
    branch: varchar('branch', { length: 32 }),
    result: jsonb('result').$type<Record<string, unknown>>().notNull().default({}),
    error: text('error'),
    senderId: text('sender_id').notNull(),
    /** Set once the queue accepted the message (lets the reaper re-enqueue after a crash with a non-transactional queue). */
    enqueuedAt: ts('enqueued_at'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index('runs_enrollment_idx').on(t.enrollmentId, t.createdAt),
    index('runs_stuck_idx')
      .on(t.status, t.startedAt)
      .where(sql`${t.status} in ('running','needs_review')`),
    index('runs_provider_idx').on(t.provider, t.providerRef),
    index('runs_thread_idx')
      .on(t.threadRef)
      .where(sql`${t.threadRef} is not null`),
    index('runs_analytics_idx').on(t.sequenceId, t.versionId, t.nodeId, t.createdAt),
  ]
);

export const messages = seq.table(
  'messages',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    contactId: text('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    senderId: text('sender_id')
      .notNull()
      .references(() => senders.id),
    runId: text('run_id').references(() => runs.id, { onDelete: 'set null' }),
    channel: varchar('channel', { length: 16 }).notNull(),
    direction: varchar('direction', { length: 8 }).notNull(),
    fromAddress: text('from_address'),
    toAddress: text('to_address'),
    subject: text('subject'),
    body: text('body'),
    status: varchar('status', { length: 16 }).notNull(),
    provider: varchar('provider', { length: 24 }).notNull(),
    providerId: text('provider_id'),
    threadRef: text('thread_ref'),
    /** Our own Message-ID for outbound email. */
    messageId: text('message_id'),
    occurredAt: ts('occurred_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('messages_provider_idx').on(t.projectId, t.provider, t.providerId),
    index('messages_contact_idx').on(t.contactId, t.occurredAt),
    index('messages_sender_out_idx')
      .on(t.senderId, t.channel, t.occurredAt)
      .where(sql`${t.direction} = 'out'`),
    index('messages_thread_idx')
      .on(t.threadRef)
      .where(sql`${t.threadRef} is not null`),
    index('messages_message_id_idx')
      .on(t.messageId)
      .where(sql`${t.messageId} is not null`),
  ]
);

// ------------------------------------------------------------------ tasks, signals, effects
export const tasks = seq.table(
  'tasks',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    enrollmentId: text('enrollment_id')
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' })
      .unique(),
    senderId: text('sender_id')
      .notNull()
      .references(() => senders.id),
    contactId: text('contact_id')
      .notNull()
      .references(() => contacts.id),
    kind: varchar('kind', { length: 32 }).notNull(),
    title: text('title').notNull(),
    body: text('body'),
    link: text('link'),
    dueAt: ts('due_at'),
    expiresAt: ts('expires_at'),
    status: varchar('status', { length: 16 }).notNull().default('open'),
    outcome: varchar('outcome', { length: 32 }),
    note: text('note'),
    connectedOutcomes: text('connected_outcomes').array().notNull().default([]),
    branchesByOutcome: jsonb('branches_by_outcome').$type<Record<string, string>>().notNull().default({}),
    onCompleted: varchar('on_completed', { length: 64 }),
    onExpired: varchar('on_expired', { length: 64 }),
    dialer: boolean('dialer').notNull().default(false),
    autoComplete: boolean('auto_complete').notNull().default(true),
    dialerPushedAt: ts('dialer_pushed_at'),
    completedAt: ts('completed_at'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index('tasks_sender_open_idx').on(t.senderId, t.status, t.dueAt),
    index('tasks_contact_idx').on(t.contactId, t.kind, t.completedAt),
    index('tasks_project_updated_idx').on(t.projectId, t.updatedAt),
    index('tasks_expiry_idx')
      .on(t.expiresAt)
      .where(sql`${t.status} = 'open'`),
  ]
);

export const signals = seq.table(
  'signals',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    contactId: text('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    kind: signalKind('kind').notNull(),
    channel: varchar('channel', { length: 16 }),
    source: varchar('source', { length: 24 }).notNull(),
    externalId: text('external_id').notNull(),
    occurredAt: ts('occurred_at').notNull(),
    receivedAt: ts('received_at').notNull().defaultNow(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    processedAt: ts('processed_at'),
    attributedRunId: text('attributed_run_id').references(() => runs.id, { onDelete: 'set null' }),
    attribution: varchar('attribution', { length: 8 }),
  },
  (t) => [
    uniqueIndex('signals_source_idx').on(t.projectId, t.source, t.externalId),
    index('signals_unprocessed_idx')
      .on(t.receivedAt)
      .where(sql`${t.processedAt} is null`),
    index('signals_contact_idx').on(t.contactId, t.occurredAt),
    index('signals_run_idx')
      .on(t.attributedRunId)
      .where(sql`${t.attributedRunId} is not null`),
  ]
);

export const signalEffects = seq.table(
  'signal_effects',
  {
    signalId: text('signal_id')
      .notNull()
      .references(() => signals.id, { onDelete: 'cascade' }),
    enrollmentId: text('enrollment_id')
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    effect: varchar('effect', { length: 16 }).notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: created(),
  },
  (t) => [uniqueIndex('signal_effects_pk').on(t.signalId, t.enrollmentId)]
);

// ------------------------------------------------------------------ flags, deliveries, scheduler, queue
export const flags = seq.table(
  'flags',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: boolean('value').notNull(),
    updatedBy: varchar('updated_by', { length: 64 }),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex('flags_pk').on(t.projectId, t.key)]
);

export const webhookDeliveries = seq.table(
  'webhook_deliveries',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    endpointId: text('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    eventId: text('event_id').notNull(),
    eventType: varchar('event_type', { length: 48 }).notNull(),
    enrollmentId: text('enrollment_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    attempts: smallint('attempts').notNull().default(0),
    nextAttemptAt: ts('next_attempt_at'),
    lastStatusCode: smallint('last_status_code'),
    lastError: text('last_error'),
    createdAt: created(),
    deliveredAt: ts('delivered_at'),
  },
  (t) => [
    uniqueIndex('webhook_deliveries_endpoint_event_idx').on(t.endpointId, t.eventId),
    index('webhook_deliveries_due_idx')
      .on(t.nextAttemptAt)
      .where(sql`${t.status} = 'pending'`),
    index('webhook_deliveries_endpoint_enrollment_idx').on(t.endpointId, t.enrollmentId, t.createdAt),
  ]
);

export const jobLocks = seq.table('job_locks', {
  job: text('job').primaryKey(),
  holder: text('holder'),
  lockedUntil: ts('locked_until').notNull().default(sql`'epoch'`),
  lastRunAt: ts('last_run_at'),
});

export const queueMessages = seq.table(
  'queue_messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    queue: varchar('queue', { length: 32 }).notNull(),
    payload: jsonb('payload').notNull(),
    visibleAt: ts('visible_at').notNull().defaultNow(),
    readCt: integer('read_ct').notNull().default(0),
    createdAt: created(),
  },
  (t) => [index('queue_ready_idx').on(t.queue, t.visibleAt)]
);

export const queueDead = seq.table('queue_dead', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  queue: varchar('queue', { length: 32 }).notNull(),
  payload: jsonb('payload').notNull(),
  readCt: integer('read_ct').notNull(),
  reason: text('reason'),
  createdAt: ts('created_at').notNull(),
  deadAt: ts('dead_at').notNull().defaultNow(),
});

export const schema = {
  projects,
  apiKeys,
  webhookEndpoints,
  idempotencyKeys,
  senders,
  senderChannels,
  contacts,
  suppressions,
  sequences,
  versions,
  enrollments,
  runs,
  messages,
  tasks,
  signals,
  signalEffects,
  flags,
  webhookDeliveries,
  jobLocks,
  queueMessages,
  queueDead,
};
