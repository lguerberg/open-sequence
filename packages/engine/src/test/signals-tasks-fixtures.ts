/**
 * Fixtures for the signal and task use-case tests: a Deps built on the throwaway Postgres with an
 * in-memory queue and stub providers, and seed helpers that go through the repositories. Every
 * call creates its own project with fresh ULIDs, so files sharing the database never collide.
 */
import type { ProviderSet, Queue, QueueMessage } from '@opensequence/core';
import type { Contact, Enrollment, Run, Sender, Task } from '../domain/entities.js';
import { systemClock } from '../domain/shared/clock.js';
import { DEFAULT_CONFIG, type Deps } from '../application/deps.js';
import { ulidIds } from '../infrastructure/id-generator.js';
import { DrizzleUnitOfWork } from '../infrastructure/persistence/unit-of-work.js';
import { testDb } from './db.js';

export class MemoryQueue implements Queue {
  readonly sent: Array<{ queue: string; payload: unknown }> = [];
  async send(queue: string, payload: unknown): Promise<void> {
    this.sent.push({ queue, payload });
  }
  async read(): Promise<QueueMessage[]> {
    return [];
  }
  async delete(): Promise<void> {}
  async archive(): Promise<void> {}
  async release(): Promise<void> {}
  async stats(): Promise<Array<{ queue: string; depth: number; oldestMs: number | null }>> {
    return [];
  }
}

const unused = () => {
  throw new Error('provider not used by this test');
};

export function stubProviders(overrides: Partial<ProviderSet> = {}): ProviderSet {
  return {
    email: { send: unused, findSent: unused, health: async () => 'active' },
    sms: { send: unused, findSent: unused, verifyWebhook: unused, listNumbers: unused, listUsers: unused, health: async () => 'active' },
    dialer: { pushNumbers: unused },
    calendar: { poll: unused },
    crm: { schema: unused, lookup: unused },
    ...overrides,
  };
}

const noopLog = { info() {}, warn() {}, error() {}, debug() {} };

export function makeDeps(overrides: Partial<Deps> = {}): Deps & { queue: MemoryQueue } {
  const queue = new MemoryQueue();
  return {
    uow: new DrizzleUnitOfWork(testDb(), ulidIds, systemClock, queue, true),
    queue,
    providers: stubProviders(),
    ids: ulidIds,
    clock: systemClock,
    log: noopLog,
    secrets: { encrypt: unused, decrypt: unused },
    config: DEFAULT_CONFIG,
    ...overrides,
  };
}

/** A published definition: email, then wait for a reply or a connected call, then a call task. */
export function definition(exitOn: Array<'reply' | 'meeting_booked'>) {
  return {
    schema_version: 1,
    entry: 'email_intro',
    settings: { reenroll: 'always' },
    exit_on: exitOn,
    nodes: {
      email_intro: { type: 'outreach', channel: 'email', action: 'send', params: { subject: 'Hi', body: 'Hello {{ unsubscribe_url }}' }, next: { sent: 'wait_reply' } },
      wait_reply: { type: 'wait_for', params: { events: ['reply', 'call_connected'], timeout: '3d' }, next: { reply: 'end_replied', call_connected: 'end_replied', timeout: 'call_1' } },
      call_1: {
        type: 'task',
        params: { kind: 'call', title: 'Call {{ contact.first_name | "them" }}', due: '1bd', expire: '3bd', dialer: true },
        next: { completed: 'end_done', no_answer: 'end_done' },
        branches_by_outcome: { connected: 'end_connected' },
      },
      end_replied: { type: 'end', params: { label: 'Replied' } },
      end_connected: { type: 'end', params: { label: 'Connected' } },
      end_done: { type: 'end' },
    },
  };
}

export interface World {
  projectId: string;
  sender: Sender;
  contact: Contact;
  sequenceId: string;
  versionId: string;
}

export async function seedWorld(deps: Deps, exitOn: Array<'reply' | 'meeting_booked'>, settings: Record<string, unknown> = {}): Promise<World> {
  const repos = deps.uow.repos;
  const projectId = deps.ids.next('project');
  const tag = projectId.slice(-8).toLowerCase();
  await repos.projects.create({ id: projectId, slug: `t-${tag}`, name: 'Signals test', settings });
  const sender = await repos.senders.upsertByExternalId({ id: deps.ids.next('sender'), projectId, externalId: `snd-${tag}`, name: 'Ana Rep', email: `ana+${tag}@example.com`, timezone: 'America/New_York', status: 'active', attrs: {} });
  await repos.senders.upsertChannel({ id: deps.ids.next('channel'), senderId: sender.id, projectId, connectionId: null, channel: 'sms', address: `+1212555${tag.slice(-4).replace(/\D/g, '0').padStart(4, '0')}`, status: 'active', dailyLimit: null, weeklyLimit: null, minGapSeconds: 0, optedInAt: null, config: { allo_user_id: 'usr-1' } });
  const contact = await repos.contacts.upsertByExternalId(
    {
      id: deps.ids.next('contact'),
      projectId,
      externalId: `ctc-${tag}`,
      firstName: 'Sam',
      lastName: 'Lead',
      email: `sam+${tag}@example.com`,
      phone: `+1415555${tag.replace(/\D/g, '0').slice(-4).padStart(4, '0')}`,
      linkedinUrl: null,
      country: 'US',
      timezone: 'America/Los_Angeles',
      smsConsent: true,
      smsConsentAt: null,
      smsConsentSource: null,
      attrs: {},
    },
    false
  );
  const sequenceId = deps.ids.next('sequence');
  const versionId = deps.ids.next('version');
  await repos.sequences.create({ id: sequenceId, projectId, externalId: null, name: 'Test', description: null, createdBy: null, labels: {}, status: 'active', defaultVersionId: null });
  await repos.sequences.createVersion({ id: versionId, projectId, sequenceId, tag: 'v1', status: 'published', definition: definition(exitOn), schemaVersion: 1, lockVersion: 0, basedOnVersionId: null, createdBy: null, publishedBy: null, publishedAt: new Date(), archivedAt: null });
  await repos.sequences.update(projectId, sequenceId, { defaultVersionId: versionId });
  return { projectId, sender, contact, sequenceId, versionId };
}

export async function seedEnrollment(deps: Deps, w: World, patch: Partial<Enrollment> = {}): Promise<Enrollment> {
  const now = deps.clock.now();
  const [e] = await deps.uow.repos.enrollments.insertMany([
    {
      id: deps.ids.next('enrollment'),
      projectId: w.projectId,
      sequenceId: w.sequenceId,
      versionId: w.versionId,
      contactId: w.contact.id,
      senderId: w.sender.id,
      enrolledBy: null,
      enrolledByKind: 'user',
      mode: 'live',
      status: 'active',
      currentNodeId: 'wait_reply',
      nextRunAt: null,
      ownerRunId: null,
      waiting: null,
      pausedUntil: null,
      pauseReason: null,
      exitReason: null,
      exitSignalId: null,
      repliedAt: null,
      repliedChannel: null,
      meetingBookedAt: null,
      meetingChannel: null,
      touchCount: 0,
      lastTouchAt: null,
      enrolledAt: now,
      finishedAt: null,
      ...patch,
    },
  ]);
  return e!;
}

/** A finished outbound step (a touch) on the enrollment, `at` the given time. */
export async function seedTouch(deps: Deps, e: Enrollment, channel: 'email' | 'sms', at: Date, touchNumber = 1): Promise<Run> {
  const run = await deps.uow.repos.runs.insert({
    id: deps.ids.next('run'),
    projectId: e.projectId,
    enrollmentId: e.id,
    sequenceId: e.sequenceId,
    versionId: e.versionId,
    nodeId: 'email_intro',
    nodeType: 'outreach',
    channel,
    action: 'send',
    touchNumber,
    attempt: 1,
    status: 'done',
    idempotencyKey: `seq:${e.id}:email_intro:a${touchNumber}`,
    next: { sent: 'wait_reply' },
    startedAt: at,
    finishedAt: at,
    provider: 'mock',
    providerRef: null,
    threadRef: null,
    branch: 'sent',
    result: {},
    error: null,
    senderId: e.senderId,
    enqueuedAt: null,
  });
  await deps.uow.repos.enrollments.update(e.id, { touchCount: touchNumber, lastTouchAt: at });
  return run;
}

/** A wait_for step the enrollment is parked on. */
export async function seedWait(deps: Deps, e: Enrollment, events: Record<string, string>, onTimeout?: string): Promise<Run> {
  const now = deps.clock.now();
  const run = await deps.uow.repos.runs.insert({
    id: deps.ids.next('run'),
    projectId: e.projectId,
    enrollmentId: e.id,
    sequenceId: e.sequenceId,
    versionId: e.versionId,
    nodeId: 'wait_reply',
    nodeType: 'wait_for',
    channel: null,
    action: null,
    touchNumber: null,
    attempt: 1,
    status: 'waiting',
    idempotencyKey: `seq:${e.id}:wait_reply:a1:${run8()}`,
    next: events,
    startedAt: now,
    finishedAt: null,
    provider: null,
    providerRef: null,
    threadRef: null,
    branch: null,
    result: {},
    error: null,
    senderId: e.senderId,
    enqueuedAt: null,
  });
  const waiting = onTimeout ? { runId: run.id, events, onTimeout } : { runId: run.id, events };
  await deps.uow.repos.enrollments.update(e.id, { currentNodeId: 'wait_reply', waiting });
  return run;
}

/** An open call task with its waiting run, as the task node would create it. */
export async function seedCallTask(deps: Deps, e: Enrollment, patch: Partial<Task> = {}): Promise<Task> {
  const now = deps.clock.now();
  const run = await deps.uow.repos.runs.insert({
    id: deps.ids.next('run'),
    projectId: e.projectId,
    enrollmentId: e.id,
    sequenceId: e.sequenceId,
    versionId: e.versionId,
    nodeId: 'call_1',
    nodeType: 'task',
    channel: null,
    action: null,
    touchNumber: null,
    attempt: 1,
    status: 'waiting',
    idempotencyKey: `seq:${e.id}:call_1:a1:${run8()}`,
    next: { completed: 'end_done', no_answer: 'end_done' },
    startedAt: now,
    finishedAt: null,
    provider: null,
    providerRef: null,
    threadRef: null,
    branch: null,
    result: {},
    error: null,
    senderId: e.senderId,
    enqueuedAt: null,
  });
  const task = await deps.uow.repos.tasks.insert({
    id: deps.ids.next('task'),
    projectId: e.projectId,
    enrollmentId: e.id,
    runId: run.id,
    senderId: e.senderId,
    contactId: e.contactId,
    kind: 'call',
    title: 'Call Sam',
    body: null,
    link: null,
    dueAt: new Date(now.getTime() + 86_400_000),
    expiresAt: new Date(now.getTime() + 3 * 86_400_000),
    status: 'open',
    outcome: null,
    note: null,
    connectedOutcomes: ['connected'],
    branchesByOutcome: { connected: 'end_connected' },
    onCompleted: 'end_done',
    onExpired: 'end_done',
    dialer: true,
    autoComplete: true,
    dialerPushedAt: null,
    completedAt: null,
    ...patch,
  });
  await deps.uow.repos.enrollments.update(e.id, { currentNodeId: 'call_1', waiting: { runId: run.id, events: {}, onTimeout: 'end_done' }, nextRunAt: task.expiresAt });
  return task;
}

function run8(): string {
  return ulidIds.next('run').slice(-8);
}
