import { validateDefinition, type Definition, type InterpretContext, type RunDraft } from '@opensequence/core';
import type { Contact, Enrollment, Run, Sender, SenderChannel, Task } from '../../domain/entities.js';
import type { Repositories, TransactionScope } from '../../domain/repositories.js';
import type { Deps } from '../deps.js';

export const ACTIVE_STATUSES = ['active', 'paused', 'waiting_limit'] as const;

const definitionCache = new Map<string, Definition>();

/** Published definitions are immutable, so they are cached forever by version id. */
export async function loadDefinition(repos: Repositories, projectId: string, versionId: string): Promise<Definition> {
  const cached = definitionCache.get(versionId);
  if (cached) return cached;
  const v = await repos.sequences.version(projectId, versionId);
  if (!v) throw new Error(`version ${versionId} not found`);
  const r = validateDefinition(v.definition);
  if (!r.ok || !r.definition) throw new Error(`version ${versionId} has an invalid definition: ${r.problems.map((p) => p.message).join('; ')}`);
  if (v.status !== 'draft') definitionCache.set(versionId, r.definition);
  return r.definition;
}

export interface StepContext {
  contact: Contact;
  sender: Sender;
  channels: SenderChannel[];
  sequenceName: string;
}

export async function loadStepContext(repos: Repositories, e: Enrollment): Promise<StepContext> {
  const [contact, sender, sequence] = await Promise.all([
    repos.contacts.byId(e.projectId, e.contactId),
    repos.senders.byId(e.projectId, e.senderId),
    repos.sequences.byId(e.projectId, e.sequenceId),
  ]);
  if (!contact || !sender || !sequence) throw new Error(`enrollment ${e.id}: contact, sender or sequence is missing`);
  const channels = await repos.senders.channels(sender.id);
  return { contact, sender, channels, sequenceName: sequence.name };
}

const OPT_OUT_TOKEN_DAYS = 90;

export function templateContextFor(deps: Deps, ctx: StepContext, enrollment: Enrollment, runId: string | null): InterpretContext['template'] {
  const c = ctx.contact;
  const exp = Math.floor(deps.clock.now().getTime() / 1000) + OPT_OUT_TOKEN_DAYS * 86_400;
  const token = runId ? deps.optOutToken({ projectId: enrollment.projectId, contactId: c.id, runId, exp }) : 'preview';
  return {
    contact: { first_name: c.firstName, last_name: c.lastName, email: c.email, phone: c.phone, country: c.country, timezone: c.timezone, attrs: c.attrs },
    // `signature` is rendered raw by the template engine: the html in html emails, the text otherwise.
    sender: { name: ctx.sender.name, first_name: ctx.sender.name.split(' ')[0], email: ctx.sender.email, timezone: ctx.sender.timezone, attrs: ctx.sender.attrs, signature: { html: ctx.sender.signatureHtml ?? '', text: ctx.sender.signatureText ?? '' } },
    sequence: { name: ctx.sequenceName },
    unsubscribe_url: `${deps.config.publicUrl}/u/${token}`,
  };
}

export function runKey(enrollmentId: string, nodeId: string, attempt: number): string {
  return `seq:${enrollmentId}:${nodeId}:a${attempt}`;
}

/** A ledger row for a logic step or a waiting step. */
export async function insertRun(deps: Deps, repos: Repositories, e: Enrollment, draft: RunDraft, status: Run['status'], branch: string | null, now: Date, finished: boolean): Promise<Run> {
  return repos.runs.insert({
    id: deps.ids.next('run'),
    projectId: e.projectId,
    enrollmentId: e.id,
    sequenceId: e.sequenceId,
    versionId: e.versionId,
    nodeId: draft.nodeId,
    nodeType: draft.nodeType,
    channel: draft.channel ?? null,
    action: draft.action ?? null,
    touchNumber: null,
    attempt: 1,
    status,
    // logic steps may run more than once (a loop through a wait), so their key carries a unique suffix
    idempotencyKey: `${runKey(e.id, draft.nodeId, 1)}:${deps.ids.next('run').slice(-8)}`,
    next: draft.next,
    startedAt: now,
    finishedAt: finished ? now : null,
    provider: null,
    providerRef: null,
    threadRef: null,
    branch,
    result: draft.result,
    error: null,
    senderId: e.senderId,
    enqueuedAt: null,
  });
}

export function enrollmentPayload(e: Enrollment): Record<string, unknown> {
  return {
    id: e.id,
    sequence: e.sequenceId,
    version: e.versionId,
    contact: e.contactId,
    sender: e.senderId,
    status: e.status,
    mode: e.mode,
    current_node_id: e.currentNodeId,
    exit_reason: e.exitReason,
    pause_reason: e.pauseReason,
    touch_count: e.touchCount,
    replied_at: e.repliedAt?.toISOString() ?? null,
    meeting_booked_at: e.meetingBookedAt?.toISOString() ?? null,
    enrolled_at: e.enrolledAt.toISOString(),
    finished_at: e.finishedAt?.toISOString() ?? null,
    seq: e.seq,
  };
}

export function taskPayload(t: Task): Record<string, unknown> {
  return {
    id: t.id,
    kind: t.kind,
    title: t.title,
    body: t.body,
    link: t.link,
    due_at: t.dueAt?.toISOString() ?? null,
    expires_at: t.expiresAt?.toISOString() ?? null,
    status: t.status,
    outcome: t.outcome,
    dialer: t.dialer,
    enrollment: t.enrollmentId,
    contact: t.contactId,
    sender: t.senderId,
  };
}

/** Ends an enrollment (completed or exited) and raises the event. Mutates `patch`. */
export function finishEnrollment(scope: TransactionScope, e: Enrollment, patch: Partial<Enrollment>, status: 'completed' | 'exited', reason: string | null, now: Date, extra: Record<string, unknown> = {}): void {
  patch.status = status;
  patch.finishedAt = now;
  patch.nextRunAt = null;
  patch.ownerRunId = null;
  patch.waiting = null;
  if (status === 'exited') patch.exitReason = reason ?? 'manual';
  scope.raise({
    type: status === 'exited' ? 'enrollment.exited' : 'enrollment.completed',
    projectId: e.projectId,
    enrollmentId: e.id,
    payload: { enrollment: enrollmentPayload({ ...e, ...patch, status } as Enrollment), exit_reason: status === 'exited' ? patch.exitReason : null, ...extra },
  });
}
