/**
 * The entities of the seq schema as the domain sees them: plain data, no ORM types. The Drizzle
 * repositories map rows to these one for one (the column names match on purpose).
 */
import type { ProjectSettings } from '../infrastructure/persistence/schema.js';

export type { ProjectSettings };

export interface Project {
  id: string;
  slug: string;
  name: string;
  settings: ProjectSettings;
  createdAt: Date;
  updatedAt: Date;
}

export type Scope = 'read' | 'enroll' | 'admin';

export interface ApiKey {
  id: string;
  projectId: string;
  name: string;
  keyHash: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface Sender {
  id: string;
  projectId: string;
  externalId: string;
  name: string;
  email: string | null;
  timezone: string;
  status: string;
  attrs: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type ChannelKind = 'email' | 'sms' | 'linkedin';
export type ChannelStatus = 'pending' | 'active' | 'paused' | 'credentials_needed' | 'restricted' | 'disconnected';

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
  optedInAt: Date | null;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Contact {
  id: string;
  projectId: string;
  externalId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  country: string | null;
  timezone: string | null;
  smsConsent: boolean;
  smsConsentAt: Date | null;
  smsConsentSource: string | null;
  attrs: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Suppression {
  contactId: string;
  channel: 'email' | 'sms' | 'linkedin' | 'all';
  reason: string;
  createdAt: Date;
}

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
  createdAt: Date;
  updatedAt: Date;
}

export interface Version {
  id: string;
  projectId: string;
  sequenceId: string;
  tag: string;
  status: VersionStatus;
  definition: Record<string, unknown>;
  schemaVersion: number;
  lockVersion: number;
  basedOnVersionId: string | null;
  createdBy: string | null;
  publishedBy: string | null;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type EnrollmentStatus = 'active' | 'paused' | 'waiting_limit' | 'completed' | 'exited' | 'failed';

export interface Waiting {
  runId: string;
  events: Record<string, string>;
  onTimeout?: string;
}

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
  nextRunAt: Date | null;
  ownerRunId: string | null;
  waiting: Waiting | null;
  pausedUntil: Date | null;
  pauseReason: string | null;
  exitReason: string | null;
  exitSignalId: string | null;
  repliedAt: Date | null;
  repliedChannel: string | null;
  meetingBookedAt: Date | null;
  meetingChannel: string | null;
  touchCount: number;
  lastTouchAt: Date | null;
  seq: number;
  enrolledAt: Date;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
  startedAt: Date | null;
  finishedAt: Date | null;
  provider: string | null;
  providerRef: string | null;
  threadRef: string | null;
  branch: string | null;
  result: Record<string, unknown>;
  error: string | null;
  senderId: string;
  enqueuedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
  occurredAt: Date;
}

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
  dueAt: Date | null;
  expiresAt: Date | null;
  status: TaskStatus | string;
  outcome: string | null;
  note: string | null;
  connectedOutcomes: string[];
  branchesByOutcome: Record<string, string>;
  onCompleted: string | null;
  onExpired: string | null;
  dialer: boolean;
  autoComplete: boolean;
  dialerPushedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
  | 'connection_accepted'
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
  occurredAt: Date;
  receivedAt: Date;
  payload: Record<string, unknown>;
  processedAt: Date | null;
  attributedRunId: string | null;
  attribution: 'direct' | 'assisted' | 'none' | string | null;
}

export interface WebhookEndpoint {
  id: string;
  projectId: string;
  url: string;
  secretEnc: string;
  keyId: string;
  eventTypes: string[];
  status: 'active' | 'disabled' | string;
  disabledReason: string | null;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookDelivery {
  id: string;
  projectId: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  enrollmentId: string | null;
  payload: Record<string, unknown>;
  status: 'pending' | 'delivered' | 'failed' | 'disabled' | string;
  attempts: number;
  nextAttemptAt: Date | null;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
}
