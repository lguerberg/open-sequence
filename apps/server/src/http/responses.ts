/**
 * Response schemas: the envelope and the exact `data` of every route, so the OpenAPI document (and
 * the SDK types and the reference pages generated from it) say what each call returns. Fastify
 * serializes every response through these, so a field missing here is a field the client never
 * sees: keep them in step with the handlers.
 *
 * Naming follows the API: stored records (contacts, senders, sequences, versions, enrollments, runs,
 * messages, signals, tasks, projects, connections, credentials) come back as the service holds them,
 * in camelCase; results built for the call (enroll results, analytics, API key summaries, webhook
 * endpoints and deliveries, counts) are snake_case, like request bodies. Every schema that is a
 * resource carries an `id` so it becomes a named component (`#/components/schemas/Contact`).
 */
import { z } from 'zod';
import { EVENT_TYPES, projectSettingsSchema } from '@opensequence/engine';

/** A stored timestamp: a Date on the way out, an ISO 8601 string in the document and on the wire. */
const at = z.date();
/** A timestamp a use case already rendered as ISO 8601. */
const iso = z.iso.datetime();
const json = z.record(z.string(), z.unknown());
const scope = z.enum(['read', 'enroll', 'admin']);

// ------------------------------------------------------------------ the envelope
export const errEnvelope = z
  .object({
    success: z.literal(false),
    error: z.object({ code: z.string().describe('Stable; branch on it.'), message: z.string().describe('Plain English; may change.'), details: z.unknown().optional().describe('Structured when there is something to act on.') }),
    meta: z.object({ request_id: z.string() }),
  })
  .meta({ id: 'ErrorEnvelope', description: 'Every failure, with the HTTP status that matches the code.' });

const errorResponses = { 400: errEnvelope, 401: errEnvelope, 403: errEnvelope, 404: errEnvelope, 409: errEnvelope, 422: errEnvelope, 429: errEnvelope, 500: errEnvelope } as const;

const envelope = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data, meta: z.object({ request_id: z.string() }) });

/** A 200 with `data` of this shape. */
export const okResponse = <T extends z.ZodType>(data: T) => ({ 200: envelope(data), ...errorResponses });
/** A 201 with `data` of this shape (creation). */
export const createdResponse = <T extends z.ZodType>(data: T) => ({ 201: envelope(data), ...errorResponses });
/** 200 or 201, same shape (an idempotent create that says whether it created). */
export const okOrCreatedResponse = <T extends z.ZodType>(data: T) => ({ 200: envelope(data), 201: envelope(data), ...errorResponses });
/** A cursor page: `data` is the array, `meta.next_cursor` is null on the last page. */
export const listResponse = <T extends z.ZodType>(item: T) => ({
  200: z.object({ success: z.literal(true), data: z.array(item), meta: z.object({ request_id: z.string(), next_cursor: z.string().nullable().describe('Pass as `cursor` for the next page; null on the last one.') }) }),
  ...errorResponses,
});

// ------------------------------------------------------------------ small shapes
export const deleted = z.object({ deleted: z.literal(true) });
export const revoked = z.object({ revoked: z.literal(true) });
export const disabled = z.object({ disabled: z.literal(true) });

export const validationProblem = z
  .object({ path: z.string().describe('A JSON path into the definition; empty for the document itself.'), code: z.string(), message: z.string(), severity: z.enum(['error', 'warning']) })
  .meta({ id: 'ValidationProblem' });

// ------------------------------------------------------------------ project, keys, engine
export const projectSettings = z.object(projectSettingsSchema.shape).meta({ id: 'ProjectSettings' });

export const project = z
  .object({ id: z.string(), slug: z.string(), name: z.string(), settings: projectSettings, createdAt: at, updatedAt: at })
  .meta({ id: 'Project' });

export const apiKeySummary = z
  .object({ id: z.string(), name: z.string(), prefix: z.string().describe('The first 12 characters of the key.'), scopes: z.array(scope), last_used_at: at.nullable(), revoked_at: at.nullable(), created_at: at })
  .meta({ id: 'ApiKeySummary', description: 'A key as the API shows it: never the secret.' });

export const createdApiKey = z
  .object({
    key: z.object({ id: z.string(), name: z.string(), prefix: z.string(), scopes: z.array(scope), created_at: at }),
    api_key: z.string().describe('The full secret, shown once.'),
  })
  .meta({ id: 'CreatedApiKey' });

export const createdProject = z.object({ project, api_key: z.string().describe('The first admin key, shown once.') }).meta({ id: 'CreatedProject' });

export const credential = z
  .object({
    id: z.string(),
    tenantId: z.string().describe('The project id.'),
    provider: z.string(),
    method: z.literal('api_key'),
    status: z.enum(['active', 'invalid']),
    keyId: z.string().describe('The encryption key the secret is stored under.'),
    last4: z.string().describe('The last four characters of the API key.'),
    config: json.describe('Non-secret settings, such as the scopes a probe reported.'),
    hasWebhookSecret: z.boolean(),
    createdAt: at,
    updatedAt: at,
  })
  .meta({ id: 'Credential', description: 'A provider credential as the API shows it: status and key id, never the secret.' });

export const projectView = z
  .object({ project: project.nullable(), credentials: z.array(credential), webhook_urls: z.object({ allo: z.string(), mock: z.string().optional().describe('Only with SEQ_DEV_MOCK_PROVIDERS.') }) })
  .meta({ id: 'ProjectView' });

export const queueStat = z.object({ queue: z.string(), depth: z.number().int(), oldestMs: z.number().nullable().describe('Age of the oldest message, in milliseconds.') }).meta({ id: 'QueueStat' });

export const engineHealth = z
  .object({ flags: z.record(z.string(), z.boolean()).describe('`global` and `channel:<name>` switches; absent means on.'), queues: z.array(queueStat), jobs: z.record(z.string(), at.nullable()).describe('When each scheduler job last ran.'), paused: z.boolean().describe('SEQ_PAUSED.') })
  .meta({ id: 'EngineHealth' });

export const platformHealth = z
  .object({ paused: z.boolean(), disabled_channels: z.array(z.string()), queues: z.array(queueStat), jobs: z.record(z.string(), at.nullable()) })
  .meta({ id: 'PlatformHealth' });

export const flagValue = z.object({ key: z.string(), value: z.boolean() });

export const alloUser = z.object({ id: z.string().describe('Allo user id (`usr-…`).'), email: z.string(), name: z.string() }).meta({ id: 'AlloUser' });
export const alloNumber = z
  .object({ address: z.string().describe('E.164.'), ref: z.string(), country: z.string(), capabilities: z.array(z.string()).describe('`SMS`, `VOICE`, …'), users: z.array(alloUser).describe('The users who can use this number.') })
  .meta({ id: 'AlloNumber' });

export const crmSchema = z
  .object({
    objects: z.array(z.object({ name: z.enum(['person', 'company', 'deal']), attributes: z.array(z.object({ slug: z.string(), label: z.string(), type: z.string(), values: z.array(z.string()).optional() })) })),
  })
  .meta({ id: 'CrmSchema' });

// ------------------------------------------------------------------ senders
export const sender = z
  .object({
    id: z.string(),
    projectId: z.string(),
    externalId: z.string().describe('Your id for this person, as given in `PUT /v1/senders/{id}`.'),
    name: z.string(),
    email: z.string().nullable(),
    timezone: z.string().describe('IANA zone.'),
    status: z.string().describe('`active` or `disabled`.'),
    attrs: json,
    signatureHtml: z.string().nullable().describe('Sanitized HTML, inserted raw by `{{ sender.signature }}` in html emails.'),
    signatureText: z.string().nullable().describe('The plain-text twin, used by text emails.'),
    createdAt: at,
    updatedAt: at,
  })
  .meta({ id: 'Sender' });

export const senderChannel = z
  .object({
    id: z.string(),
    senderId: z.string(),
    projectId: z.string(),
    connectionId: z.string().nullable().describe('The mailbox connection behind an email channel.'),
    channel: z.string().describe('`email` or `sms`.'),
    address: z.string().describe('The from address or the E.164 number.'),
    status: z.string().describe('`pending`, `active`, `paused`, `credentials_needed`, `restricted` or `disconnected`; only `active` sends.'),
    dailyLimit: z.number().int().nullable(),
    weeklyLimit: z.number().int().nullable().describe('Stored, not enforced yet.'),
    minGapSeconds: z.number().int(),
    optedInAt: at.nullable(),
    config: json.describe('Non-secret settings: `provider`, `allo_user_id`, the IMAP cursor.'),
    createdAt: at,
    updatedAt: at,
  })
  .meta({ id: 'SenderChannel' });

const channelReadiness = z.object({ ok: z.boolean(), reason: z.string().optional().describe('`no_email_channel`, `no_allo_number`, or `<channel>_<status>` when the channel is not active.') });
export const readiness = z.object({ email: channelReadiness, sms: channelReadiness, task: z.object({ ok: z.literal(true) }) }).meta({ id: 'Readiness', description: 'Which steps a sender can run, and why not.' });

export const connection = z
  .object({
    id: z.string(),
    tenantId: z.string().describe('The project id.'),
    ownerId: z.string().describe('The sender id.'),
    provider: z.string().describe('`smtp`.'),
    account: z.string().nullable().describe('The mailbox address.'),
    scopes: z.array(z.string()),
    status: z.enum(['pending', 'active', 'credentials_needed', 'reauth_needed', 'restricted', 'disconnected']),
    keyId: z.string().nullable(),
    config: json.describe('Hosts and ports; never a password.'),
    lastOkAt: at.nullable(),
    lastError: z.string().nullable(),
    createdAt: at,
    updatedAt: at,
  })
  .meta({ id: 'Connection', description: 'A mailbox connection as the API shows it: never the passwords.' });

export const senderDetail = sender.extend({ channels: z.array(senderChannel), readiness, connections: z.array(connection) }).meta({ id: 'SenderDetail' });

// ------------------------------------------------------------------ contacts
export const contact = z
  .object({
    id: z.string(),
    projectId: z.string(),
    externalId: z.string().describe('Your id for this person, as given in `PUT /v1/contacts/{id}`.'),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable().describe('E.164.'),
    country: z.string().nullable().describe('ISO 3166-1 alpha-2, upper case.'),
    timezone: z.string().nullable().describe('IANA zone.'),
    smsConsent: z.boolean(),
    smsConsentAt: at.nullable(),
    smsConsentSource: z.string().nullable(),
    attrs: json,
    createdAt: at,
    updatedAt: at,
  })
  .meta({ id: 'Contact' });

export const suppression = z
  .object({ contactId: z.string(), channel: z.enum(['email', 'sms', 'all']), reason: z.string().describe('`opt_out`, `hard_bounce`, `complaint`, or the reason you reported.'), createdAt: at })
  .meta({ id: 'Suppression' });

export const enrollmentStatus = z.enum(['active', 'paused', 'waiting_limit', 'completed', 'exited', 'failed']);

export const activeEnrollment = z
  .object({ id: z.string(), sequenceId: z.string(), versionId: z.string(), senderId: z.string(), status: enrollmentStatus, currentNodeId: z.string() })
  .meta({ id: 'ActiveEnrollment', description: 'The enrollment a contact is in, for badges.' });

export const contactStatus = z.object({ contact: z.object({ id: z.string(), external_id: z.string() }), enrollment: activeEnrollment.nullable() }).meta({ id: 'ContactStatus' });

export const contactDetail = contact.extend({ suppressions: z.array(suppression), enrollment: activeEnrollment.nullable() }).meta({ id: 'ContactDetail' });

export const reportedEvent = z.object({ signal: z.string().describe('The signal the event became.'), created: z.boolean().describe('False when the event id was seen before.') }).meta({ id: 'ReportedEvent' });
export const reportedEvents = z.array(z.object({ id: z.string().describe('Your event id.'), signal: z.string(), created: z.boolean() }));

// ------------------------------------------------------------------ sequences and versions
export const sequenceStatus = z.enum(['active', 'paused', 'archived']);
export const versionStatus = z.enum(['draft', 'published', 'archived']);

export const sequence = z
  .object({
    id: z.string(),
    projectId: z.string(),
    externalId: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    createdBy: z.string().nullable(),
    labels: json,
    status: sequenceStatus,
    defaultVersionId: z.string().nullable().describe('The published version new enrollments use.'),
    createdAt: at,
    updatedAt: at,
  })
  .meta({ id: 'Sequence' });

export const version = z
  .object({
    id: z.string(),
    projectId: z.string(),
    sequenceId: z.string(),
    tag: z.string(),
    status: versionStatus,
    definition: json.describe('The sequence definition document.'),
    schemaVersion: z.number().int(),
    lockVersion: z.number().int().describe('Send it back as `lock_version` when saving a draft.'),
    basedOnVersionId: z.string().nullable(),
    createdBy: z.string().nullable(),
    publishedBy: z.string().nullable(),
    publishedAt: at.nullable(),
    archivedAt: at.nullable(),
    createdAt: at,
    updatedAt: at,
  })
  .meta({ id: 'Version' });

export const versionSummary = z.object({ id: z.string(), tag: z.string(), status: versionStatus, published_at: at.nullable(), created_at: at }).meta({ id: 'VersionSummary' });

export const enrollmentCounts = z
  .object({ active: z.number().int(), paused: z.number().int(), waiting_limit: z.number().int(), completed: z.number().int(), exited: z.number().int(), failed: z.number().int() })
  .meta({ id: 'EnrollmentCounts', description: 'Enrollments of the sequence by status, every version together. Replies and meetings come from the analytics endpoints.' });

export const sequenceListItem = sequence.extend({ versions: z.array(versionSummary), counts: enrollmentCounts }).meta({ id: 'SequenceListItem' });
export const sequenceDetail = sequence.extend({ versions: z.array(versionSummary) }).meta({ id: 'SequenceDetail' });

export const versionWithProblems = z.object({ version, problems: z.array(validationProblem).describe('Current validation problems; warnings do not block publishing.') }).meta({ id: 'VersionWithProblems' });
export const createdSequence = z.object({ sequence, version: version.describe('The `v1` draft.'), problems: z.array(validationProblem) }).meta({ id: 'CreatedSequence' });
export const validationResult = z.object({ ok: z.boolean().describe('True when no problem is an error.'), problems: z.array(validationProblem) }).meta({ id: 'ValidationResult' });

const transitions = z.object({ keys: z.array(z.string()).describe('In the order a canvas should show them.'), required: z.array(z.string()).describe('Keys that must be wired.') });
export const schemaCatalogue = z
  .object({
    definition: json.describe('JSON Schema of a definition.'),
    nodes: z.array(z.object({ type: z.string(), label: z.string(), transitions, params: json.describe('JSON Schema of the node params.') })),
    channels: z.array(z.object({ name: z.string(), label: z.string(), actions: z.array(z.object({ action: z.string(), label: z.string(), transitions, touch: z.boolean(), params: json })) })),
  })
  .meta({ id: 'SchemaCatalogue' });

const factField = z.object({ field: z.string(), label: z.string(), type: z.enum(['text', 'number', 'bool', 'enum', 'date']), values: z.array(z.string()).optional() });
export const schemaFields = z
  .object({
    sources: z.array(z.object({ prefix: z.string(), label: z.string(), open: z.boolean().describe('When true any `<prefix>.<path>` is accepted.'), fields: z.array(factField) })),
    attrs: z.array(z.object({ field: z.string(), label: z.string(), type: z.string(), values: z.array(z.string()).optional() })).describe('From the project `attrs_schema`.'),
  })
  .meta({ id: 'SchemaFields' });

export const eventTypes = z.array(z.enum(EVENT_TYPES as [string, ...string[]]));

// ------------------------------------------------------------------ enrollments and the journey
export const enrollment = z
  .object({
    id: z.string(),
    projectId: z.string(),
    sequenceId: z.string(),
    versionId: z.string().describe('Pinned at enroll time.'),
    contactId: z.string(),
    senderId: z.string(),
    enrolledBy: z.string().nullable(),
    enrolledByKind: z.string().describe('`user`, `agent` or `system`.'),
    mode: z.string().describe('`live` or `dry_run`.'),
    status: enrollmentStatus,
    currentNodeId: z.string(),
    nextRunAt: at.nullable(),
    ownerRunId: z.string().nullable().describe('The run an executor is working on right now.'),
    waiting: z.object({ runId: z.string(), events: z.record(z.string(), z.string()).describe('Event name to transition key.'), onTimeout: z.string().optional() }).nullable(),
    pausedUntil: at.nullable(),
    pauseReason: z.string().nullable().describe('`manual`, `ooo` or `step_failed`.'),
    exitReason: z.string().nullable().describe('`replied`, `meeting_booked`, `opt_out`, `bounced`, `suppressed`, `manual` or `deleted`.'),
    exitSignalId: z.string().nullable(),
    repliedAt: at.nullable(),
    repliedChannel: z.string().nullable(),
    meetingBookedAt: at.nullable(),
    meetingChannel: z.string().nullable(),
    touchCount: z.number().int(),
    lastTouchAt: at.nullable(),
    seq: z.number().int().describe('Per-enrollment event counter; webhooks carry it so a receiver can order events.'),
    enrolledAt: at,
    finishedAt: at.nullable(),
    createdAt: at,
    updatedAt: at,
  })
  .meta({ id: 'Enrollment' });

export const enrollmentListItem = enrollment
  .extend({ contact: z.object({ id: z.string(), external_id: z.string(), name: z.string().nullable(), email: z.string().nullable() }).nullable().describe('A summary; `GET /v1/contacts/{id}` has the rest.') })
  .meta({ id: 'EnrollmentListItem' });

export const enrollPreview = z
  .object({
    accepted: z.array(z.object({ contact_id: z.string(), external_id: z.string(), first_touch_at: iso })),
    skipped: z.array(z.object({ contact_id: z.string(), external_id: z.string(), reason: z.string().describe('`suppressed:<reason>`, `already_enrolled_before` or `reenroll_before_<n>d`.') })),
    capacity: z.object({ per_day: z.number().int().describe("The sender's email daily_limit."), days_to_first_touches: z.number().int() }),
  })
  .meta({ id: 'EnrollPreview' });

export const enrollResult = enrollPreview
  .extend({ enrollments: z.array(z.object({ id: z.string(), contact: z.string().describe('The contact id.'), status: enrollmentStatus, next_run_at: at.nullable() })) })
  .meta({ id: 'EnrollResult' });

export const runStatus = z.enum(['running', 'waiting', 'done', 'deferred', 'skipped', 'failed', 'needs_review', 'skipped_dry_run']);

export const run = z
  .object({
    id: z.string(),
    projectId: z.string(),
    enrollmentId: z.string(),
    sequenceId: z.string(),
    versionId: z.string(),
    nodeId: z.string(),
    nodeType: z.string(),
    channel: z.string().nullable(),
    action: z.string().nullable(),
    touchNumber: z.number().int().nullable().describe('Set when the step counted as a touch.'),
    attempt: z.number().int(),
    status: runStatus,
    idempotencyKey: z.string(),
    next: z.record(z.string(), z.string()).describe('Transition key to node id.'),
    startedAt: at.nullable(),
    finishedAt: at.nullable(),
    provider: z.string().nullable(),
    providerRef: z.string().nullable().describe("The provider's id for what was sent."),
    threadRef: z.string().nullable().describe('The email thread replies are matched to.'),
    branch: z.string().nullable().describe('The transition taken.'),
    result: json.describe('What the step saw and did: `facts`, `rendered`, `skip_reason`, `outcome`, …'),
    error: z.string().nullable(),
    senderId: z.string(),
    enqueuedAt: at.nullable(),
    createdAt: at,
    updatedAt: at,
  })
  .meta({ id: 'Run' });

export const message = z
  .object({
    id: z.string(),
    projectId: z.string(),
    contactId: z.string(),
    senderId: z.string(),
    runId: z.string().nullable().describe('The outreach run that sent it; null for inbound.'),
    channel: z.string(),
    direction: z.enum(['out', 'in']),
    fromAddress: z.string().nullable(),
    toAddress: z.string().nullable(),
    subject: z.string().nullable(),
    body: z.string().nullable().describe('Inbound bodies are stored only with `store_inbound_bodies`.'),
    status: z.string().describe('`sent`, `delivered`, `bounced`, `received`, …'),
    provider: z.string(),
    providerId: z.string().nullable(),
    threadRef: z.string().nullable(),
    messageId: z.string().nullable().describe('The RFC 5322 Message-ID.'),
    occurredAt: at,
  })
  .meta({ id: 'Message' });

export const signalKind = z.enum(['reply', 'bounce', 'complaint', 'opt_out', 'ooo', 'task_completed', 'call_connected', 'meeting_booked', 'sender_channel_status', 'contact_suppressed', 'crm_changed']);

export const signal = z
  .object({
    id: z.string(),
    projectId: z.string(),
    contactId: z.string(),
    kind: signalKind,
    channel: z.string().nullable(),
    source: z.string().describe('`smtp`, `allo`, `client`, `optout_link`, `mock`, …'),
    externalId: z.string().describe("The provider's or your event id; the idempotency key."),
    occurredAt: at,
    receivedAt: at,
    payload: json,
    processedAt: at.nullable(),
    attributedRunId: z.string().nullable(),
    attribution: z.string().nullable().describe('`direct`, `assisted` or `none`.'),
  })
  .meta({ id: 'Signal' });

export const task = z
  .object({
    id: z.string(),
    projectId: z.string(),
    enrollmentId: z.string(),
    runId: z.string(),
    senderId: z.string(),
    contactId: z.string(),
    kind: z.string().describe('`call`, `linkedin`, `manual`, …'),
    title: z.string(),
    body: z.string().nullable(),
    link: z.string().nullable(),
    dueAt: at.nullable(),
    expiresAt: at.nullable().describe('When it takes `no_answer` by itself.'),
    status: z.string().describe('`open`, `done`, `expired` or `cancelled`.'),
    outcome: z.string().nullable(),
    note: z.string().nullable(),
    connectedOutcomes: z.array(z.string()).describe('Outcomes that count as a reply.'),
    branchesByOutcome: z.record(z.string(), z.string()),
    onCompleted: z.string().nullable(),
    onExpired: z.string().nullable(),
    dialer: z.boolean().describe('Pushed to the Allo dialer.'),
    autoComplete: z.boolean(),
    dialerPushedAt: at.nullable(),
    completedAt: at.nullable(),
    createdAt: at,
    updatedAt: at,
  })
  .meta({ id: 'Task' });

export const journey = z
  .object({ enrollment, contact, version: version.describe('The pinned version, with its definition.'), runs: z.array(run).describe('In order; the path is consecutive runs.'), messages: z.array(message), signals: z.array(signal), tasks: z.array(task) })
  .meta({ id: 'Journey' });

export const timelineItem = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('message'), at, item: message }),
    z.object({ kind: z.literal('signal'), at, item: signal }),
    z.object({ kind: z.literal('task'), at, item: task }),
  ])
  .meta({ id: 'TimelineItem' });

export const exited = z.object({ exited: z.number().int() });

// ------------------------------------------------------------------ webhooks
export const webhookEndpoint = z
  .object({
    id: z.string(),
    url: z.string(),
    event_types: z.array(z.string()).describe('Event types, or `["*"]`.'),
    status: z.string().describe('`active` or `disabled`.'),
    disabled_reason: z.string().nullable(),
    disabled_at: iso.nullable(),
    created_at: iso,
    updated_at: iso,
  })
  .meta({ id: 'WebhookEndpoint' });

export const webhookEndpointWithSecret = z.object({ endpoint: webhookEndpoint, secret: z.string().describe('`whsec_…`, shown once.') }).meta({ id: 'WebhookEndpointWithSecret' });
export const enabledEndpoint = z.object({ endpoint: webhookEndpoint, replayed: z.number().int().describe('Held deliveries sent again.') });
export const replayed = z.object({ replayed: z.number().int() });

export const webhookDelivery = z
  .object({
    id: z.string(),
    endpoint: z.string(),
    event_id: z.string(),
    event_type: z.string(),
    enrollment: z.string().nullable(),
    status: z.string().describe('`pending`, `delivered`, `failed` or `disabled`.'),
    attempts: z.number().int(),
    next_attempt_at: iso.nullable(),
    last_status_code: z.number().int().nullable(),
    last_error: z.string().nullable(),
    payload: json.describe('The event body as sent.'),
    created_at: iso,
    delivered_at: iso.nullable(),
  })
  .meta({ id: 'WebhookDelivery' });

// ------------------------------------------------------------------ analytics
const rate = z.number().nullable().describe('Per 100, one decimal; null without a denominator.');

export const sequenceSummary = z
  .object({
    sequence: z.string(),
    enrolled: z.number().int(),
    active: z.number().int().describe('Includes `paused` and `waiting_limit`.'),
    exited: z.number().int(),
    completed: z.number().int(),
    touches_delivered: z.number().int(),
    replies: z.number().int(),
    meetings: z.number().int(),
    reply_rate_per_100_enrolled: rate,
    meeting_rate_per_100_enrolled: rate,
    reply_rate_per_100_delivered: rate,
    meeting_rate_per_100_delivered: rate,
    replies_by_channel: z.record(z.string(), z.number().int()),
  })
  .meta({ id: 'SequenceSummary' });

export const sequenceExits = z.object({ sequence: z.string(), exits: z.array(z.object({ reason: z.string(), count: z.number().int() })).describe('Largest first.') }).meta({ id: 'SequenceExits' });

export const nodeReport = z
  .object({
    node_id: z.string(),
    node_type: z.string(),
    channel: z.string().nullable(),
    reached: z.number().int(),
    executed: z.number().int(),
    skipped: z.number().int(),
    skipped_by_reason: z.record(z.string(), z.number().int()),
    failed: z.number().int(),
    delivered: z.number().int(),
    bounced: z.number().int(),
    replies: z.number().int(),
    meetings: z.number().int(),
    reply_rate_per_100_delivered: rate,
    median_time_to_reply_seconds: z.number().nullable(),
  })
  .meta({ id: 'NodeReport' });
export const sequenceNodes = z.object({ sequence: z.string(), nodes: z.array(nodeReport) }).meta({ id: 'SequenceNodes' });

export const channelReport = z
  .object({
    channel: z.string(),
    touch_number: z.number().int().describe('0 groups the skipped and failed runs of the channel.'),
    reached: z.number().int(),
    sent: z.number().int(),
    skipped: z.number().int(),
    delivered: z.number().int(),
    bounced: z.number().int(),
    replies: z.number().int(),
    meetings: z.number().int(),
    reply_rate_per_100_sent: rate,
    meeting_rate_per_100_sent: rate,
  })
  .meta({ id: 'ChannelReport' });
export const sequenceChannels = z.object({ sequence: z.string(), channels: z.array(channelReport) }).meta({ id: 'SequenceChannels' });

export const sequenceRow = z
  .object({ sequence: z.string(), name: z.string(), status: z.string(), enrolled: z.number().int(), replies: z.number().int(), meetings: z.number().int(), replies_per_100_enrolled: rate, meetings_per_100_enrolled: rate })
  .meta({ id: 'SequenceRow' });
export const allSequences = z.object({ sequences: z.array(sequenceRow).describe('Ranked by replies then meetings per 100 enrolled.') }).meta({ id: 'AllSequences' });
