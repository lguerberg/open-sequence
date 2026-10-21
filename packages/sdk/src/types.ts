/**
 * Response shapes, taken from the server's OpenAPI file (`generated/openapi.ts`, written by
 * `pnpm generate` from `apps/server/openapi.json`): every route declares its response schema, so
 * these types are the ones the server serializes with. Request bodies and query strings come from
 * the generated `paths` through the `Body` and `QueryOf` helpers.
 *
 * Naming, as on the API: stored records (contacts, senders, sequences, versions, enrollments, runs,
 * messages, signals, tasks, projects, connections, credentials) are camelCase (`externalId`,
 * `lockVersion`, `currentNodeId`); request bodies and results built for the call (enroll results,
 * analytics, API key summaries, webhook endpoints and deliveries, counts) are snake_case. Dates are
 * ISO-8601 strings.
 */
import type { components, paths } from './generated/openapi.js';

export type { ListQuery, Page } from './client.js';

// ------------------------------------------------------------------ generated-type helpers
type MethodOf<P extends keyof paths> = keyof paths[P];
type Schemas = components['schemas'];

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

export type ValidationProblem = Schemas['ValidationProblem'];

/** A sequence definition document (docs/ARCHITECTURE.md section 5). Fetch its JSON Schema with `oseq.schema.definition()`. */
export type Definition = Record<string, unknown>;

// ------------------------------------------------------------------ project
export type ProjectSettings = Schemas['ProjectSettings'];
export type Project = Schemas['Project'];
/** What an unsubscribe page shows (`unsubscribes.get`) and what applying a token did (`unsubscribes.apply`). */
export type UnsubscribeStatus = Schemas['UnsubscribeStatus'];
/** A provider credential as the API shows it: status and key id, never the secret. */
export type CredentialView = Schemas['Credential'];
export type ProjectView = Schemas['ProjectView'];
export type ApiKeySummary = Schemas['ApiKeySummary'];
/** `api_key` is the full secret, shown once. */
export type CreatedApiKey = Schemas['CreatedApiKey'];
export type QueueStat = Schemas['QueueStat'];
export type EngineHealth = Schemas['EngineHealth'];
export type AlloNumber = Schemas['AlloNumber'];
export type AlloUser = Schemas['AlloUser'];
export type CrmSchema = Schemas['CrmSchema'];

// ------------------------------------------------------------------ senders
export type Sender = Schemas['Sender'];
export type SenderChannel = Schemas['SenderChannel'];
export type Readiness = Schemas['Readiness'];
export type ChannelReadiness = Readiness['email'];
/** A mailbox connection as the API shows it: never the passwords. */
export type ConnectionView = Schemas['Connection'];
/** The sender with its channels, readiness and connections. */
export type SenderDetail = Schemas['SenderDetail'];

// ------------------------------------------------------------------ contacts
export type Contact = Schemas['Contact'];
export type Suppression = Schemas['Suppression'];
/** The enrollment a contact is in, for badges. */
export type ActiveEnrollmentSummary = Schemas['ActiveEnrollment'];
export type ContactStatus = Schemas['ContactStatus'];
/** The contact with suppressions and the active enrollment. */
export type ContactDetail = Schemas['ContactDetail'];
export type TimelineItem = Schemas['TimelineItem'];
/** `signal` is the signal the event became; `created` is false when the event id was seen before. */
export type ReportedEvent = Schemas['ReportedEvent'];

// ------------------------------------------------------------------ sequences and versions
export type Sequence = Schemas['Sequence'];
export type SequenceStatus = Sequence['status'];
export type Version = Schemas['Version'];
export type VersionStatus = Version['status'];
export type VersionSummary = Schemas['VersionSummary'];
/** Enrollments by status, every version together; replies and meetings come from analytics. */
export type EnrollmentCounts = Schemas['EnrollmentCounts'];
export type SequenceListItem = Schemas['SequenceListItem'];
export type SequenceDetail = Schemas['SequenceDetail'];
export type VersionWithProblems = Schemas['VersionWithProblems'];
export type CreatedSequence = Schemas['CreatedSequence'];
export type ValidationResult = Schemas['ValidationResult'];

// ------------------------------------------------------------------ enrollments
export type Enrollment = Schemas['Enrollment'];
export type EnrollmentStatus = Enrollment['status'];
export type EnrollmentListItem = Schemas['EnrollmentListItem'];
export type EnrollPreview = Schemas['EnrollPreview'];
export type EnrollResult = Schemas['EnrollResult'];

/** The `details` of a 409 ALREADY_IN_SEQUENCE error. */
export interface AlreadyInSequenceDetails {
  conflicts: Array<{
    contact_id: string;
    external_id: string;
    name?: string | null;
    sequence_id: string;
    sequence_name?: string | null;
    version?: string | null;
    sender?: string | null;
    enrollment_id: string;
    status: string;
  }>;
}

export type Run = Schemas['Run'];
export type RunStatus = Run['status'];
export type Message = Schemas['Message'];
export type Signal = Schemas['Signal'];
export type SignalKind = Signal['kind'];
/** `GET /v1/enrollments/{id}`: the pinned definition plus everything that happened. */
export type Journey = Schemas['Journey'];

// ------------------------------------------------------------------ tasks
export type Task = Schemas['Task'];
export type TaskStatus = 'open' | 'done' | 'expired' | 'cancelled';

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

export type WebhookEndpoint = Schemas['WebhookEndpoint'];
/** `secret` is `whsec_…`, shown once. Pass it to `verifyWebhook`. */
export type WebhookEndpointWithSecret = Schemas['WebhookEndpointWithSecret'];
export type WebhookDelivery = Schemas['WebhookDelivery'];

/** The body of an outbound webhook, after `verifyWebhook`. `data` is the event's payload (docs section 9.2). */
export interface WebhookEvent<T = Record<string, unknown>> {
  id: string;
  type: EventType | string;
  project: string;
  occurred_at: string;
  data: T;
}

// ------------------------------------------------------------------ analytics
export type SequenceSummary = Schemas['SequenceSummary'];
export type SequenceExits = Schemas['SequenceExits'];
export type NodeReport = Schemas['NodeReport'];
export type ChannelReport = Schemas['ChannelReport'];
export type SequenceRow = Schemas['SequenceRow'];

/** Filters every analytics endpoint accepts. A type alias so it stays assignable to the client's `Query`. */
export type AnalyticsQuery = {
  version?: string;
  from?: DateInput;
  to?: DateInput;
  sender?: string;
  country?: string;
};

// ------------------------------------------------------------------ schema
export type SchemaCatalogue = Schemas['SchemaCatalogue'];
export type SchemaFields = Schemas['SchemaFields'];
