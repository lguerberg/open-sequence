/**
 * Response shapes, hand-written from the server's route handlers and the engine's entities, since
 * the OpenAPI file types every `data` as unknown. Request bodies and query strings come from the
 * generated `paths` through the `Body` and `QueryOf` helpers.
 *
 * Known inconsistency, kept on purpose: request bodies are snake_case (`first_name`, `lock_version`)
 * while entities come back in camelCase (`firstName`, `lockVersion`, `currentNodeId`). Use-case
 * results that are built by hand on the server (analytics, webhooks, enroll results) are snake_case.
 * Dates are ISO-8601 strings.
 */
import type { paths } from './generated/openapi.js';

export type { ListQuery, Page } from './client.js';

// ------------------------------------------------------------------ generated-type helpers
type MethodOf<P extends keyof paths> = keyof paths[P];

/** The JSON request body of one operation, e.g. `Body<'/v1/senders/{id}', 'put'>`. */
export type Body<P extends keyof paths, M extends MethodOf<P>> = paths[P][M] extends { requestBody: { content: { 'application/json': infer B } } }
  ? B
  : paths[P][M] extends { requestBody?: { content: { 'application/json': infer B } } }
    ? B | undefined
    : never;

/** The query string of one operation. Coerced dates arrive as `unknown`; the SDK accepts `string | Date`. */
export type QueryOf<P extends keyof paths, M extends MethodOf<P>> = paths[P][M] extends { parameters: { query?: infer Q } } ? Q : never;

/** A date the server coerces: send an ISO string or a Date. */
export type DateInput = string | Date;

export type Scope = 'read' | 'enroll' | 'admin';
export type Channel = 'email' | 'sms';

export interface ValidationProblem {
  path: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

/** A sequence definition document (docs/ARCHITECTURE.md section 5). Fetch its JSON Schema with `oseq.schema.definition()`. */
export type Definition = Record<string, unknown>;

// ------------------------------------------------------------------ project
export interface ProjectSettings {
  attribution_days?: number;
  sms_countries?: string[];
  send_window?: { days: string[]; from: string; to: string; tz: 'contact' | 'sender' };
  attrs_schema?: Record<string, { type: string; label?: string; values?: string[] }>;
  retention_days?: number;
  store_inbound_bodies?: boolean;
  match_replies_outside_thread?: boolean;
  crm?: { deal_selection?: 'newest_open' | 'highest_value' | 'any_open' };
  allo?: { outcome_map?: Record<string, string> };
  max_steps_per_tick?: number;
  mock?: Record<string, unknown>;
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
}

/** A provider credential as the API shows it: status and key id, never the secret. */
export interface CredentialView {
  id: string;
  tenantId: string;
  provider: string;
  method: 'api_key' | string;
  status: string;
  keyId: string;
  last4: string;
  config: Record<string, unknown>;
  hasWebhookSecret: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectView {
  project: Project | null;
  credentials: CredentialView[];
  webhook_urls: { allo: string; mock?: string };
}

export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  last_used_at?: string | null;
  revoked_at?: string | null;
  created_at?: string;
}

export interface CreatedApiKey {
  key: ApiKeySummary;
  /** The full secret, shown once. */
  api_key: string;
}

export interface QueueStat {
  queue: string;
  depth: number;
  oldestMs: number | null;
}

export interface EngineHealth {
  flags: Record<string, boolean>;
  queues: QueueStat[];
  jobs: Record<string, string | null>;
  paused: boolean;
}

export interface AlloNumber {
  address: string;
  ref: string;
  country: string;
  capabilities: string[];
  users: AlloUser[];
}

export interface AlloUser {
  id: string;
  email: string;
  name: string;
}

export interface CrmSchema {
  objects: Array<{ name: 'person' | 'company' | 'deal'; attributes: Array<{ slug: string; label: string; type: string; values?: string[] }> }>;
}

// ------------------------------------------------------------------ senders
export interface Sender {
  id: string;
  projectId: string;
  externalId: string;
  name: string;
  email: string | null;
  timezone: string;
  status: string;
  attrs: Record<string, unknown>;
  /** Sanitized HTML, rendered raw by `{{ sender.signature }}` in html emails; null when unset. */
  signatureHtml: string | null;
  /** The plain-text twin, used by text emails. */
  signatureText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SenderChannel {
  id: string;
  senderId: string;
  projectId: string;
  connectionId: string | null;
  channel: string;
  address: string;
  status: string;
  dailyLimit: number | null;
  weeklyLimit: number | null;
  minGapSeconds: number;
  optedInAt: string | null;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelReadiness {
  ok: boolean;
  reason?: string;
}

export interface Readiness {
  email: ChannelReadiness;
  sms: ChannelReadiness;
  task: { ok: true };
}

export interface ConnectionView {
  id: string;
  tenantId: string;
  ownerId: string;
  provider: string;
  account: string | null;
  scopes: string[];
  status: string;
  keyId: string | null;
  config: Record<string, unknown>;
  lastOkAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface SenderDetail extends Sender {
  channels: SenderChannel[];
  readiness: Readiness;
  connections: ConnectionView[];
}

// ------------------------------------------------------------------ contacts
export interface Contact {
  id: string;
  projectId: string;
  externalId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  timezone: string | null;
  smsConsent: boolean;
  smsConsentAt: string | null;
  smsConsentSource: string | null;
  attrs: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Suppression {
  contactId: string;
  channel: Channel | 'all';
  reason: string;
  createdAt: string;
}

export interface ActiveEnrollmentSummary {
  id: string;
  sequenceId: string;
  versionId: string;
  senderId: string;
  status: EnrollmentStatus;
  currentNodeId: string;
}

export interface ContactStatus {
  contact: { id: string; external_id: string };
  enrollment: ActiveEnrollmentSummary | null;
}

export interface ContactDetail extends Contact {
  suppressions: Suppression[];
  enrollment: ActiveEnrollmentSummary | null;
}

export type TimelineItem = { kind: 'message'; at: string; item: Message } | { kind: 'signal'; at: string; item: Signal } | { kind: 'task'; at: string; item: Task };

export interface ReportedEvent {
  /** The signal the event became. */
  signal: string;
  /** False when the event id was seen before (idempotent). */
  created: boolean;
}

// ------------------------------------------------------------------ sequences and versions
export type SequenceStatus = 'active' | 'paused' | 'archived';
export type VersionStatus = 'draft' | 'published' | 'archived';

export interface Sequence {
  id: string;
  projectId: string;
  externalId: string | null;
  name: string;
  description: string | null;
  createdBy: string | null;
  labels: Record<string, unknown>;
  status: SequenceStatus;
  defaultVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Version {
  id: string;
  projectId: string;
  sequenceId: string;
  tag: string;
  status: VersionStatus;
  definition: Definition;
  schemaVersion: number;
  lockVersion: number;
  basedOnVersionId: string | null;
  createdBy: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VersionSummary {
  id: string;
  tag: string;
  status: VersionStatus;
  published_at?: string | null;
  created_at?: string;
}

export interface SequenceListItem extends Sequence {
  versions: VersionSummary[];
  /** Enrollment counts by status (`active`, `exited`, …). */
  counts: Record<string, number>;
}

export interface SequenceDetail extends Sequence {
  versions: VersionSummary[];
}

export interface VersionWithProblems {
  version: Version;
  problems: ValidationProblem[];
}

export interface CreatedSequence extends VersionWithProblems {
  sequence: Sequence;
}

export interface ValidationResult {
  ok: boolean;
  problems: ValidationProblem[];
}

// ------------------------------------------------------------------ enrollments
export type EnrollmentStatus = 'active' | 'paused' | 'waiting_limit' | 'completed' | 'exited' | 'failed';

export interface Enrollment {
  id: string;
  projectId: string;
  sequenceId: string;
  versionId: string;
  contactId: string;
  senderId: string;
  enrolledBy: string | null;
  enrolledByKind: string;
  mode: 'live' | 'dry_run' | string;
  status: EnrollmentStatus;
  currentNodeId: string;
  nextRunAt: string | null;
  ownerRunId: string | null;
  waiting: { runId: string; events: Record<string, string>; onTimeout?: string } | null;
  pausedUntil: string | null;
  pauseReason: string | null;
  exitReason: string | null;
  exitSignalId: string | null;
  repliedAt: string | null;
  repliedChannel: string | null;
  meetingBookedAt: string | null;
  meetingChannel: string | null;
  touchCount: number;
  lastTouchAt: string | null;
  /** Per-enrollment event counter; webhooks carry it so a receiver can order events. */
  seq: number;
  enrolledAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnrollmentListItem extends Enrollment {
  contact: { id: string; external_id: string; name: string | null; email: string | null } | null;
}

export interface EnrollPreview {
  accepted: Array<{ contact_id: string; external_id: string; first_touch_at: string }>;
  skipped: Array<{ contact_id: string; external_id: string; reason: string }>;
  capacity: { per_day: number; days_to_first_touches: number };
}

export interface EnrollResult extends EnrollPreview {
  enrollments: Array<{ id: string; contact: string; status: EnrollmentStatus; next_run_at: string | null }>;
}

/** The `details` of a 409 ALREADY_IN_SEQUENCE error. */
export interface AlreadyInSequenceDetails {
  conflicts: Array<{
    contact_id: string;
    external_id: string;
    name?: string;
    sequence_id: string;
    sequence_name?: string;
    version?: string;
    sender?: string;
    enrollment_id: string;
    status: string;
  }>;
}

export type RunStatus = 'running' | 'waiting' | 'done' | 'deferred' | 'skipped' | 'failed' | 'needs_review' | 'skipped_dry_run';

export interface Run {
  id: string;
  projectId: string;
  enrollmentId: string;
  sequenceId: string;
  versionId: string;
  nodeId: string;
  nodeType: string;
  channel: string | null;
  action: string | null;
  touchNumber: number | null;
  attempt: number;
  status: RunStatus;
  idempotencyKey: string;
  next: Record<string, string>;
  startedAt: string | null;
  finishedAt: string | null;
  provider: string | null;
  providerRef: string | null;
  threadRef: string | null;
  branch: string | null;
  result: Record<string, unknown>;
  error: string | null;
  senderId: string;
  enqueuedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  projectId: string;
  contactId: string;
  senderId: string;
  runId: string | null;
  channel: string;
  direction: 'out' | 'in';
  fromAddress: string | null;
  toAddress: string | null;
  subject: string | null;
  body: string | null;
  status: string;
  provider: string;
  providerId: string | null;
  threadRef: string | null;
  messageId: string | null;
  occurredAt: string;
}

export type SignalKind =
  | 'reply'
  | 'bounce'
  | 'complaint'
  | 'opt_out'
  | 'ooo'
  | 'task_completed'
  | 'call_connected'
  | 'meeting_booked'
  | 'sender_channel_status'
  | 'contact_suppressed'
  | 'crm_changed';

export interface Signal {
  id: string;
  projectId: string;
  contactId: string;
  kind: SignalKind;
  channel: string | null;
  source: string;
  externalId: string;
  occurredAt: string;
  receivedAt: string;
  payload: Record<string, unknown>;
  processedAt: string | null;
  attributedRunId: string | null;
  attribution: 'direct' | 'assisted' | 'none' | string | null;
}

/** `GET /v1/enrollments/{id}`: the pinned definition plus everything that happened. */
export interface Journey {
  enrollment: Enrollment;
  contact: Contact;
  version: Version;
  runs: Run[];
  messages: Message[];
  signals: Signal[];
  tasks: Task[];
}

// ------------------------------------------------------------------ tasks
export type TaskStatus = 'open' | 'done' | 'expired' | 'cancelled';

export interface Task {
  id: string;
  projectId: string;
  enrollmentId: string;
  runId: string;
  senderId: string;
  contactId: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  dueAt: string | null;
  expiresAt: string | null;
  status: TaskStatus | string;
  outcome: string | null;
  note: string | null;
  connectedOutcomes: string[];
  branchesByOutcome: Record<string, string>;
  onCompleted: string | null;
  onExpired: string | null;
  dialer: boolean;
  autoComplete: boolean;
  dialerPushedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ------------------------------------------------------------------ webhooks
export type EventType =
  | 'enrollment.created'
  | 'enrollment.exited'
  | 'enrollment.completed'
  | 'enrollment.paused'
  | 'enrollment.resumed'
  | 'run.done'
  | 'run.skipped'
  | 'run.failed'
  | 'run.needs_review'
  | 'task.created'
  | 'task.expired'
  | 'signal.received'
  | 'sender.channel_status'
  | 'endpoint.disabled';

export interface WebhookEndpoint {
  id: string;
  url: string;
  event_types: string[];
  status: 'active' | 'disabled' | string;
  disabled_reason: string | null;
  disabled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookEndpointWithSecret {
  endpoint: WebhookEndpoint;
  /** `whsec_…`, shown once. Pass it to `verifyWebhook`. */
  secret: string;
}

export interface WebhookDelivery {
  id: string;
  endpoint: string;
  event_id: string;
  event_type: string;
  enrollment: string | null;
  status: 'pending' | 'delivered' | 'failed' | 'disabled' | string;
  attempts: number;
  next_attempt_at: string | null;
  last_status_code: number | null;
  last_error: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  delivered_at: string | null;
}

/** The body of an outbound webhook, after `verifyWebhook`. `data` is the event's payload (docs section 9.2). */
export interface WebhookEvent<T = Record<string, unknown>> {
  id: string;
  type: EventType | string;
  project: string;
  occurred_at: string;
  data: T;
}

// ------------------------------------------------------------------ analytics
export interface SequenceSummary {
  sequence: string;
  enrolled: number;
  active: number;
  exited: number;
  completed: number;
  touches_delivered: number;
  replies: number;
  meetings: number;
  reply_rate_per_100_enrolled: number | null;
  meeting_rate_per_100_enrolled: number | null;
  reply_rate_per_100_delivered: number | null;
  meeting_rate_per_100_delivered: number | null;
  replies_by_channel: Record<string, number>;
}

export interface SequenceExits {
  sequence: string;
  exits: Array<{ reason: string; count: number }>;
}

export interface NodeReport {
  node_id: string;
  node_type: string;
  channel: string | null;
  reached: number;
  executed: number;
  skipped: number;
  skipped_by_reason: Record<string, number>;
  failed: number;
  delivered: number;
  bounced: number;
  replies: number;
  meetings: number;
  reply_rate_per_100_delivered: number | null;
  median_time_to_reply_seconds: number | null;
}

export interface ChannelReport {
  channel: string;
  touch_number: number;
  reached: number;
  sent: number;
  skipped: number;
  delivered: number;
  bounced: number;
  replies: number;
  meetings: number;
  reply_rate_per_100_sent: number | null;
  meeting_rate_per_100_sent: number | null;
}

export interface SequenceRow {
  sequence: string;
  name: string;
  status: string;
  enrolled: number;
  replies: number;
  meetings: number;
  replies_per_100_enrolled: number | null;
  meetings_per_100_enrolled: number | null;
}

/** Filters every analytics endpoint accepts. A type alias so it stays assignable to the client's `Query`. */
export type AnalyticsQuery = {
  version?: string;
  from?: DateInput;
  to?: DateInput;
  sender?: string;
  country?: string;
};

// ------------------------------------------------------------------ schema
export interface SchemaCatalogue {
  definition: Record<string, unknown>;
  nodes: Array<{ type: string; label: string; transitions: string[]; params: Record<string, unknown> }>;
  channels: Array<{ name: string; label: string; actions: Array<{ action: string; label: string; transitions: string[]; touch: boolean; params: Record<string, unknown> }> }>;
}

export interface SchemaFields {
  sources: Array<{ prefix: string; label: string; open: boolean; fields: unknown }>;
  attrs: Array<{ field: string; label: string; type: string; values?: string[] }>;
}
