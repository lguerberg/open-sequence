/**
 * Repository interfaces: what the use cases need from persistence, nothing more. Implemented with
 * Drizzle in infrastructure/persistence. Every method is scoped by project where it matters.
 */
import type {
  ApiKey,
  Contact,
  Enrollment,
  Message,
  Project,
  Run,
  RunStatus,
  Sender,
  SenderChannel,
  Sequence,
  Signal,
  Suppression,
  Task,
  Version,
  WebhookDelivery,
  WebhookEndpoint,
} from './entities.js';
import type { DomainEvent } from './shared/events.js';

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ListOptions {
  limit: number;
  cursor?: string | null;
  updatedSince?: Date | null;
}

// ------------------------------------------------------------------ projects
export interface ProjectRepository {
  create(p: Omit<Project, 'createdAt' | 'updatedAt'>): Promise<Project>;
  byId(id: string): Promise<Project | null>;
  bySlug(slug: string): Promise<Project | null>;
  list(): Promise<Project[]>;
  updateSettings(id: string, settings: Project['settings']): Promise<Project>;
  createApiKey(k: Omit<ApiKey, 'createdAt' | 'lastUsedAt' | 'revokedAt'>): Promise<ApiKey>;
  apiKeyByHash(hash: string): Promise<ApiKey | null>;
  listApiKeys(projectId: string): Promise<ApiKey[]>;
  revokeApiKey(projectId: string, id: string): Promise<void>;
  touchApiKey(id: string, at: Date): Promise<void>;
  getFlag(projectId: string, key: string): Promise<boolean | null>;
  setFlag(projectId: string, key: string, value: boolean, by: string | null): Promise<void>;
  listFlags(projectId: string): Promise<Record<string, boolean>>;
}

// ------------------------------------------------------------------ senders
export interface SenderRepository {
  upsertByExternalId(s: Omit<Sender, 'id' | 'createdAt' | 'updatedAt'> & { id: string }): Promise<Sender>;
  byId(projectId: string, id: string): Promise<Sender | null>;
  byExternalId(projectId: string, externalId: string): Promise<Sender | null>;
  list(projectId: string, opts: ListOptions): Promise<Page<Sender>>;
  setStatus(projectId: string, id: string, status: string): Promise<void>;
  channels(senderId: string): Promise<SenderChannel[]>;
  channel(senderId: string, channel: string): Promise<SenderChannel | null>;
  channelById(id: string): Promise<SenderChannel | null>;
  channelByAddress(projectId: string, channel: string, address: string): Promise<SenderChannel | null>;
  upsertChannel(c: Omit<SenderChannel, 'createdAt' | 'updatedAt'>): Promise<SenderChannel>;
  updateChannel(id: string, patch: Partial<Pick<SenderChannel, 'status' | 'dailyLimit' | 'weeklyLimit' | 'minGapSeconds' | 'optedInAt' | 'config' | 'connectionId'>>): Promise<SenderChannel>;
  deleteChannel(senderId: string, channel: string): Promise<void>;
  /** Channels of one kind and status across all projects, oldest first (the poll job). */
  listChannels(channel: string, status: string, limit: number): Promise<SenderChannel[]>;
  /** Outbound messages on a channel in the last window, for the daily cap. */
  sentCount(senderId: string, channel: string, since: Date): Promise<number>;
  lastSentAt(senderId: string, channel: string): Promise<Date | null>;
}

// ------------------------------------------------------------------ contacts
export interface ContactRepository {
  upsertByExternalId(c: Omit<Contact, 'createdAt' | 'updatedAt'>, mergeAttrs: boolean): Promise<Contact>;
  byId(projectId: string, id: string): Promise<Contact | null>;
  byIds(projectId: string, ids: string[]): Promise<Contact[]>;
  byExternalId(projectId: string, externalId: string): Promise<Contact | null>;
  byExternalIds(projectId: string, externalIds: string[]): Promise<Contact[]>;
  byEmail(projectId: string, email: string): Promise<Contact | null>;
  byPhone(projectId: string, phone: string): Promise<Contact | null>;
  list(projectId: string, opts: ListOptions & { email?: string; externalId?: string }): Promise<Page<Contact>>;
  patch(projectId: string, id: string, patch: Partial<Omit<Contact, 'id' | 'projectId' | 'externalId' | 'createdAt' | 'updatedAt'>>, mergeAttrs: boolean): Promise<Contact>;
  delete(projectId: string, id: string): Promise<void>;
  suppressions(contactId: string): Promise<Suppression[]>;
  suppress(projectId: string, contactId: string, channel: Suppression['channel'], reason: string): Promise<void>;
}

// ------------------------------------------------------------------ sequences
export interface SequenceRepository {
  create(s: Omit<Sequence, 'createdAt' | 'updatedAt'>): Promise<Sequence>;
  byId(projectId: string, id: string): Promise<Sequence | null>;
  byExternalId(projectId: string, externalId: string): Promise<Sequence | null>;
  list(projectId: string, opts: ListOptions): Promise<Page<Sequence>>;
  update(projectId: string, id: string, patch: Partial<Pick<Sequence, 'name' | 'description' | 'labels' | 'status' | 'defaultVersionId'>>): Promise<Sequence>;
  createVersion(v: Omit<Version, 'createdAt' | 'updatedAt'>): Promise<Version>;
  version(projectId: string, id: string): Promise<Version | null>;
  versions(sequenceId: string): Promise<Version[]>;
  saveDraft(id: string, definition: Record<string, unknown>, expectedLock: number): Promise<Version | 'stale' | 'not_editable'>;
  publish(id: string, by: string | null, at: Date): Promise<Version>;
  archiveVersion(id: string, at: Date): Promise<Version>;
  deleteDraft(id: string): Promise<boolean>;
  countActiveEnrollments(sequenceId: string): Promise<number>;
}

// ------------------------------------------------------------------ enrollments and runs
export interface EnrollmentConflict {
  contactId: string;
  enrollmentId: string;
  sequenceId: string;
  versionId: string;
  senderId: string;
  status: string;
}

export interface EnrollmentRepository {
  insertMany(rows: Array<Omit<Enrollment, 'createdAt' | 'updatedAt' | 'seq'>>): Promise<Enrollment[]>;
  byId(id: string): Promise<Enrollment | null>;
  /** SELECT ... FOR UPDATE inside the current transaction. */
  lock(id: string): Promise<Enrollment | null>;
  activeByContacts(projectId: string, contactIds: string[]): Promise<EnrollmentConflict[]>;
  lastBySequenceAndContact(sequenceId: string, contactId: string): Promise<Enrollment | null>;
  /** Active and recently touched enrollments of a contact (for signals and attribution). */
  forSignal(contactId: string, touchedSince: Date): Promise<Enrollment[]>;
  list(projectId: string, filter: { sequenceId?: string; versionId?: string; status?: string; senderId?: string; contactId?: string; exitReason?: string }, opts: ListOptions): Promise<Page<Enrollment>>;
  update(id: string, patch: Partial<Omit<Enrollment, 'id' | 'projectId' | 'createdAt'>>): Promise<Enrollment>;
  /** Fair claim: up to `perSender` due rows per sender, SKIP LOCKED, in the current transaction. The token is written to owner_run_id. */
  claimDue(now: Date, perSender: number, maxTotal: number): Promise<{ token: string; ids: string[] }>;
  /** A planner that crashed between claim and advance leaves its token behind; hand those rows back. Returns how many. */
  releaseStaleClaims(olderThan: Date): Promise<number>;
  duePaused(now: Date, limit: number): Promise<Enrollment[]>;
  countBySequence(sequenceId: string): Promise<Record<string, number>>;
}

export interface RunRepository {
  insert(r: Omit<Run, 'createdAt' | 'updatedAt'>): Promise<Run>;
  /** Insert, or re-use a deferred run with the same idempotency key (one run per step). */
  upsertByKey(r: Omit<Run, 'createdAt' | 'updatedAt'>): Promise<Run>;
  byId(id: string): Promise<Run | null>;
  lock(id: string): Promise<Run | null>;
  byEnrollment(enrollmentId: string): Promise<Run[]>;
  update(id: string, patch: Partial<Pick<Run, 'status' | 'startedAt' | 'finishedAt' | 'provider' | 'providerRef' | 'threadRef' | 'branch' | 'result' | 'error' | 'touchNumber' | 'enqueuedAt' | 'attempt'>>): Promise<Run>;
  patchResult(id: string, patch: Record<string, unknown>): Promise<void>;
  byThreadRef(projectId: string, threadRef: string): Promise<Run | null>;
  byProviderRef(projectId: string, provider: string, ref: string): Promise<Run | null>;
  /** Latest done touch for a contact on a channel before a time (attribution). */
  latestTouch(contactId: string, channel: string | null, before: Date): Promise<Run | null>;
  stuck(status: RunStatus, olderThan: Date, limit: number): Promise<Run[]>;
  /** Running runs that were never confirmed enqueued (non-transactional queue crash window). */
  runningWithoutMessage(olderThan: Date, limit: number): Promise<Run[]>;
  countByEnrollmentAndType(enrollmentId: string, nodeType: string, channel?: string): Promise<number>;
}

// ------------------------------------------------------------------ messages, tasks, signals
export interface MessageRepository {
  insert(m: Message): Promise<Message>;
  byProviderId(projectId: string, provider: string, providerId: string): Promise<Message | null>;
  byMessageId(projectId: string, messageId: string): Promise<Message | null>;
  byContact(contactId: string, limit: number): Promise<Message[]>;
  update(id: string, patch: Partial<Pick<Message, 'status' | 'providerId' | 'threadRef' | 'occurredAt'>>): Promise<void>;
  outboundThreadRefs(senderId: string, channel: string, since: Date): Promise<{ threadRefs: string[]; messageIds: string[] }>;
}

export interface TaskRepository {
  insert(t: Omit<Task, 'createdAt' | 'updatedAt'>): Promise<Task>;
  byId(projectId: string, id: string): Promise<Task | null>;
  byRun(runId: string): Promise<Task | null>;
  lock(id: string): Promise<Task | null>;
  list(projectId: string, filter: { senderId?: string; status?: string; kind?: string; contactId?: string }, opts: ListOptions): Promise<Page<Task>>;
  update(id: string, patch: Partial<Pick<Task, 'status' | 'outcome' | 'note' | 'completedAt' | 'dialerPushedAt'>>): Promise<Task>;
  expired(now: Date, limit: number): Promise<Task[]>;
  /** The open call task for a sender and contact, if any (Allo auto-complete). */
  openCall(senderId: string, contactId: string): Promise<Task | null>;
  openDialerTasks(senderId: string): Promise<Task[]>;
  /** Open call tasks marked for the dialer that were never pushed, oldest first. */
  openUnpushedDialerTasks(limit: number): Promise<Task[]>;
  latestForContact(contactId: string): Promise<Task | null>;
  countForContactSince(contactId: string, since: Date): Promise<number>;
}

export interface SignalRepository {
  /** Insert, or return the existing one when (project, source, externalId) was already recorded. */
  insertIfNew(s: Omit<Signal, 'receivedAt' | 'processedAt' | 'attributedRunId' | 'attribution'>): Promise<{ signal: Signal; created: boolean }>;
  byId(id: string): Promise<Signal | null>;
  markProcessed(id: string, at: Date): Promise<void>;
  attribute(id: string, runId: string | null, attribution: 'direct' | 'assisted' | 'none'): Promise<void>;
  unprocessed(olderThan: Date, limit: number): Promise<Signal[]>;
  byContact(contactId: string, limit: number): Promise<Signal[]>;
  hasEffect(signalId: string, enrollmentId: string): Promise<boolean>;
  recordEffect(signalId: string, enrollmentId: string, effect: string, detail: Record<string, unknown>): Promise<void>;
  /** The earliest reply or meeting since a time for a contact (history facts). */
  latestOfKind(contactId: string, kinds: string[], since: Date | null): Promise<Signal | null>;
}

// ------------------------------------------------------------------ webhooks
export interface WebhookRepository {
  createEndpoint(e: Omit<WebhookEndpoint, 'createdAt' | 'updatedAt' | 'disabledAt' | 'disabledReason'>): Promise<WebhookEndpoint>;
  endpoint(projectId: string, id: string): Promise<WebhookEndpoint | null>;
  endpoints(projectId: string): Promise<WebhookEndpoint[]>;
  activeEndpointsFor(projectId: string, eventType: string): Promise<WebhookEndpoint[]>;
  updateEndpoint(id: string, patch: Partial<Pick<WebhookEndpoint, 'url' | 'eventTypes' | 'status' | 'disabledReason' | 'disabledAt' | 'secretEnc' | 'keyId'>>): Promise<WebhookEndpoint>;
  deleteEndpoint(projectId: string, id: string): Promise<void>;
  insertDeliveries(rows: Array<Omit<WebhookDelivery, 'createdAt' | 'deliveredAt' | 'attempts' | 'lastStatusCode' | 'lastError'>>): Promise<WebhookDelivery[]>;
  delivery(id: string): Promise<WebhookDelivery | null>;
  lockDelivery(id: string): Promise<WebhookDelivery | null>;
  updateDelivery(id: string, patch: Partial<Pick<WebhookDelivery, 'status' | 'attempts' | 'nextAttemptAt' | 'lastStatusCode' | 'lastError' | 'deliveredAt'>>): Promise<void>;
  /** Is an earlier delivery for the same endpoint and enrollment still pending? (ordering per enrollment) */
  hasEarlierPending(endpointId: string, enrollmentId: string, before: Date): Promise<boolean>;
  due(now: Date, limit: number): Promise<WebhookDelivery[]>;
  /** The next pending delivery for an endpoint and enrollment, in creation order (ordering per enrollment). */
  oldestPending(endpointId: string, enrollmentId: string): Promise<WebhookDelivery | null>;
  listDeliveries(endpointId: string, opts: ListOptions): Promise<Page<WebhookDelivery>>;
  failedSince(endpointId: string, since: Date): Promise<WebhookDelivery[]>;
  /** Deliveries held back while the endpoint was disabled; re-enabling replays them. */
  heldDeliveries(endpointId: string): Promise<WebhookDelivery[]>;
  /** Milliseconds since the oldest pending delivery was created, or null when nothing is pending. */
  oldestPendingAge(endpointId: string, now: Date): Promise<number | null>;
}

// ------------------------------------------------------------------ analytics (read model, docs section 11)
export interface AnalyticsFilter {
  projectId: string;
  sequenceId: string;
  versionId?: string | null;
  from?: Date | null;
  to?: Date | null;
  senderId?: string | null;
  /** ISO 3166-1 alpha-2, matched on the contact. */
  country?: string | null;
}

export interface EnrollmentCounts {
  enrolled: number;
  active: number;
  exited: number;
  completed: number;
  replies: number;
  meetings: number;
}

export interface NodeStats {
  nodeId: string;
  nodeType: string;
  channel: string | null;
  reached: number;
  executed: number;
  skipped: number;
  failed: number;
  delivered: number;
  bounced: number;
  replies: number;
  meetings: number;
  medianTimeToReplySeconds: number | null;
}

export interface ChannelStats {
  channel: string;
  touchNumber: number;
  reached: number;
  sent: number;
  skipped: number;
  delivered: number;
  bounced: number;
  replies: number;
  meetings: number;
}

export interface SequenceTotals {
  sequenceId: string;
  name: string;
  status: string;
  enrolled: number;
  replies: number;
  meetings: number;
}

/** Aggregates read straight from the ledgers; no rollup to keep correct. */
export interface AnalyticsReadModel {
  enrollmentCounts(f: AnalyticsFilter): Promise<EnrollmentCounts>;
  repliesByChannel(f: AnalyticsFilter): Promise<Record<string, number>>;
  exitsByReason(f: AnalyticsFilter): Promise<Record<string, number>>;
  /** Outreach runs whose message was delivered (the denominator of "rate vs touches delivered"). */
  deliveredTouches(f: AnalyticsFilter): Promise<number>;
  nodeStats(f: AnalyticsFilter): Promise<NodeStats[]>;
  skipsByReason(f: AnalyticsFilter): Promise<Array<{ nodeId: string; reason: string; count: number }>>;
  channelStats(f: AnalyticsFilter): Promise<ChannelStats[]>;
  sequenceTotals(projectId: string, f: Omit<AnalyticsFilter, 'projectId' | 'sequenceId'>): Promise<SequenceTotals[]>;
}

// ------------------------------------------------------------------ idempotency, scheduler
export interface IdempotencyRepository {
  get(projectId: string, key: string): Promise<{ requestHash: string; statusCode: number; response: unknown } | null>;
  put(projectId: string, key: string, requestHash: string, statusCode: number, response: unknown): Promise<void>;
}

export interface SchedulerRepository {
  /** Take the lease for a job if it is free; returns true when this replica should run it. */
  acquire(job: string, holder: string, ttlMs: number, now: Date): Promise<boolean>;
  markRan(job: string, at: Date): Promise<void>;
  lastRuns(): Promise<Record<string, Date | null>>;
  /** Retention: old idempotency keys, old dead-queue rows and old delivered webhook deliveries. Returns the counts. */
  purge(input: { idempotencyBefore: Date; deadQueueBefore: Date; deliveredBefore: Date }): Promise<{ idempotencyKeys: number; deadQueue: number; deliveries: number }>;
}

// ------------------------------------------------------------------ the unit of work
export interface Repositories {
  projects: ProjectRepository;
  senders: SenderRepository;
  contacts: ContactRepository;
  sequences: SequenceRepository;
  enrollments: EnrollmentRepository;
  runs: RunRepository;
  messages: MessageRepository;
  tasks: TaskRepository;
  signals: SignalRepository;
  webhooks: WebhookRepository;
  idempotency: IdempotencyRepository;
  scheduler: SchedulerRepository;
  analytics: AnalyticsReadModel;
}

/**
 * A unit of work: one transaction, one set of repositories bound to it, and the events raised
 * inside it, written as deliveries before commit. The queue's `send` can join the transaction when
 * the backend supports it (postgres); the engine passes the transaction handle as `tx`.
 */
export interface UnitOfWork {
  readonly repos: Repositories;
  transaction<T>(fn: (uow: TransactionScope) => Promise<T>): Promise<T>;
}

export interface TransactionScope {
  readonly repos: Repositories;
  /** Opaque handle for queue backends that can enqueue inside the transaction. */
  readonly tx: unknown;
  raise(event: Omit<DomainEvent, 'occurredAt'> & { occurredAt?: Date }): void;
}
