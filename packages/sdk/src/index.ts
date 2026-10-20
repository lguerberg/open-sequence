/**
 * @opensequence/sdk: a typed, fetch-based client for the OpenSequence API, plus Standard Webhooks
 * verification. Zero runtime dependencies (fetch and node:crypto).
 *
 *   const oseq = new OpenSequence({ baseUrl, apiKey });
 *   await oseq.senders.upsert('u_42', { name: 'Max Rivera', email: 'max@acme.com' });
 */
import { HttpClient, type ClientOptions } from './client.js';
import { Admin } from './resources/admin.js';
import { Analytics } from './resources/analytics.js';
import { Contacts } from './resources/contacts.js';
import { Enrollments } from './resources/enrollments.js';
import { ProjectResource } from './resources/project.js';
import { Schema } from './resources/schema.js';
import { Senders } from './resources/senders.js';
import { Sequences } from './resources/sequences.js';
import { Tasks } from './resources/tasks.js';
import { Webhooks } from './resources/webhooks.js';

export type OpenSequenceOptions = ClientOptions;

/** A project client: everything a project API key can do, by resource. */
export class OpenSequence {
  readonly senders: Senders;
  readonly contacts: Contacts;
  readonly sequences: Sequences;
  readonly enrollments: Enrollments;
  readonly tasks: Tasks;
  readonly webhooks: Webhooks;
  readonly analytics: Analytics;
  readonly project: ProjectResource;
  readonly schema: Schema;
  /** The HTTP core, for an endpoint the SDK has no method for yet. */
  readonly http: HttpClient;

  constructor(options: OpenSequenceOptions) {
    this.http = new HttpClient(options);
    this.senders = new Senders(this.http);
    this.contacts = new Contacts(this.http);
    this.sequences = new Sequences(this.http);
    this.enrollments = new Enrollments(this.http);
    this.tasks = new Tasks(this.http);
    this.webhooks = new Webhooks(this.http);
    this.analytics = new Analytics(this.http);
    this.project = new ProjectResource(this.http);
    this.schema = new Schema(this.http);
  }
}

export interface OpenSequenceAdminOptions extends Omit<ClientOptions, 'apiKey'> {
  /** The deployment's `SEQ_ADMIN_TOKEN`. */
  adminToken: string;
}

/** The operator client: creates projects and keys with the admin token. */
export class OpenSequenceAdmin {
  readonly projects: Admin['projects'];
  readonly http: HttpClient;
  private readonly admin: Admin;

  constructor(options: OpenSequenceAdminOptions) {
    const { adminToken, ...rest } = options;
    this.http = new HttpClient({ ...rest, apiKey: adminToken });
    this.admin = new Admin(this.http);
    this.projects = this.admin.projects;
  }

  engineHealth(): ReturnType<Admin['engineHealth']> {
    return this.admin.engineHealth();
  }
}

export { HttpClient, encodeQuery, SDK_VERSION } from './client.js';
export type { ClientOptions, FetchLike, ListQuery, Page, Query, QueryValue, RequestOptions } from './client.js';
export { OpenSequenceError } from './errors.js';
export type { OpenSequenceErrorInit } from './errors.js';
export { verifyWebhook, signWebhook, WebhookVerificationError, DEFAULT_TOLERANCE_SECONDS } from './webhooks.js';
export type { HeaderLike, VerifyWebhookInput } from './webhooks.js';
export type * from './types.js';
export type { paths } from './generated/openapi.js';

export { Senders } from './resources/senders.js';
export type { SenderInput, SmsChannelInput, ChannelPatch, SenderTasksQuery } from './resources/senders.js';
export { Contacts } from './resources/contacts.js';
export type { ContactInput, ContactWithExternalId, ContactListQuery, ClientEvent, ClientEventForContact, SmsConsentInput } from './resources/contacts.js';
export { Sequences, Versions } from './resources/sequences.js';
export type { CreateSequenceInput, SequencePatch, NewVersionInput, SaveDraftInput, PublishInput, EnrollInput } from './resources/sequences.js';
export { Enrollments } from './resources/enrollments.js';
export type { EnrollmentListQuery, PauseInput, ExitInput, ExitManyInput } from './resources/enrollments.js';
export { Tasks } from './resources/tasks.js';
export type { TaskListQuery, CompleteTaskInput } from './resources/tasks.js';
export { Webhooks } from './resources/webhooks.js';
export type { EndpointInput, EndpointPatch, RecoverInput } from './resources/webhooks.js';
export { Analytics } from './resources/analytics.js';
export type { AllSequencesQuery } from './resources/analytics.js';
export { ProjectResource, ApiKeys, Flags } from './resources/project.js';
export type { Provider, ProviderCredentialInput, CreateApiKeyInput } from './resources/project.js';
export { Schema } from './resources/schema.js';
export { Admin, AdminProjects } from './resources/admin.js';
export type { CreateProjectInput, AdminCreateApiKeyInput, CreatedProject, PlatformHealth } from './resources/admin.js';
