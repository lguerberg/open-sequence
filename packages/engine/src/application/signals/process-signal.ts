/**
 * process(signal) (docs section 8.2): contact-level consequences first, then for every enrollment
 * the signal can touch, in its own transaction: attribute, exit or pause, wake a waiting step, and
 * record the effect so a redelivered signal changes nothing. Woken enrollments advance after commit.
 */
import { ensureBuiltins } from '@opensequence/core';
import type { Enrollment, Signal, Suppression } from '../../domain/entities.js';
import type { Repositories, TransactionScope } from '../../domain/repositories.js';
import type { Deps } from '../deps.js';
import { advanceEnrollment } from '../enrollments/advance-enrollment.js';
import { ACTIVE_STATUSES, closeWaitingStep, enrollmentPayload, finishEnrollment, loadDefinition } from '../enrollments/shared.js';
import { effectiveSettings } from '../projects/shared.js';
import { attributeSignal, builtInExitReason, chosenExitReason, contactPayload, REPLY_KINDS, signalPayload, wakeEventNames, type Credit } from './shared.js';

const OOO_DEFAULT_MS = 7 * 86_400_000;

export async function processSignal(deps: Deps, signalId: string): Promise<void> {
  ensureBuiltins();
  const repos = deps.uow.repos;
  const signal = await repos.signals.byId(signalId);
  if (!signal || signal.processedAt) return;
  const project = await repos.projects.byId(signal.projectId);
  if (!project) return;
  const settings = effectiveSettings(project);
  const now = deps.clock.now();

  await suppressContact(repos, signal);

  const touchedSince = new Date(signal.occurredAt.getTime() - settings.attribution_days * 86_400_000);
  const candidates = await repos.enrollments.forSignal(signal.contactId, touchedSince);
  let credit: Credit | null = null;
  const woken: string[] = [];
  for (const candidate of candidates) {
    await deps.uow.transaction(async (scope) => {
      const out = await applyToEnrollment(deps, scope, signal, candidate.id, candidates, now);
      if (out?.credit) credit = out.credit;
      if (out?.woken) woken.push(candidate.id);
    });
  }

  await deps.uow.transaction(async (scope) => {
    const c: Credit | null = credit;
    await scope.repos.signals.attribute(signal.id, c?.runId ?? null, c?.attribution ?? 'none');
    await scope.repos.signals.markProcessed(signal.id, now);
    const contact = await scope.repos.contacts.byId(signal.projectId, signal.contactId);
    scope.raise({
      type: 'signal.received',
      projectId: signal.projectId,
      payload: {
        signal: signalPayload({ ...signal, attributedRunId: c?.runId ?? null, attribution: c?.attribution ?? 'none' }),
        contact: contact ? contactPayload(contact) : { id: signal.contactId },
      },
    });
  });

  for (const id of woken) await advanceEnrollment(deps, id);
}

/** Opt-outs, bounces, complaints and client suppressions mark the contact before any enrollment is touched. */
async function suppressContact(repos: Repositories, signal: Signal): Promise<void> {
  const { projectId, contactId, payload } = signal;
  const asChannel = (v: unknown): Suppression['channel'] => (v === 'email' || v === 'sms' ? v : 'all');
  switch (signal.kind) {
    case 'opt_out':
      return repos.contacts.suppress(projectId, contactId, asChannel(signal.channel), 'opt_out');
    case 'bounce':
      if (payload['hard'] === false) return;
      return repos.contacts.suppress(projectId, contactId, 'email', 'hard_bounce');
    case 'complaint':
      return repos.contacts.suppress(projectId, contactId, 'email', 'complaint');
    case 'contact_suppressed':
      return repos.contacts.suppress(projectId, contactId, 'all', typeof payload['reason'] === 'string' && payload['reason'] ? payload['reason'] : 'client');
    default:
      return;
  }
}

interface EnrollmentOutcome {
  credit: Credit | null;
  woken: boolean;
}

async function applyToEnrollment(deps: Deps, scope: TransactionScope, signal: Signal, enrollmentId: string, candidates: Enrollment[], now: Date): Promise<EnrollmentOutcome | null> {
  const { repos } = scope;
  const e = await repos.enrollments.lock(enrollmentId);
  if (!e) return null;
  if (await repos.signals.hasEffect(signal.id, e.id)) return null;
  const patch: Partial<Enrollment> = {};
  const detail: Record<string, unknown> = {};
  let effect = 'none';
  let credit: Credit | null = null;
  let woken = false;

  // 1. attribute: the first reply and the first meeting per enrollment, never rewritten
  const attributed = await attributeSignal(repos, signal, e, candidates);
  if (attributed) {
    const run = attributed.runId ? await repos.runs.byId(attributed.runId) : null;
    if (REPLY_KINDS.includes(signal.kind) && !e.repliedAt) {
      patch.repliedAt = signal.occurredAt;
      patch.repliedChannel = signal.channel ?? run?.channel ?? null;
      credit = attributed;
    } else if (signal.kind === 'meeting_booked' && !e.meetingBookedAt) {
      patch.meetingBookedAt = signal.occurredAt;
      patch.meetingChannel = signal.channel ?? run?.channel ?? null;
      credit = attributed;
    }
    if (credit) {
      effect = 'attributed';
      detail['attribution'] = credit.attribution;
      detail['run_id'] = credit.runId;
    }
  }

  // 2. exit, 3. pause, 4. wake
  if ((ACTIVE_STATUSES as readonly string[]).includes(e.status)) {
    const exitReason = builtInExitReason(signal) ?? (await chosenExit(repos, signal, e));
    if (exitReason) {
      await closeWaitingStep(scope, e, 'exit', now);
      patch.exitSignalId = signal.id;
      finishEnrollment(scope, e, patch, 'exited', exitReason, now, { signal: signal.id });
      effect = 'exited';
      detail['reason'] = exitReason;
    } else if (signal.kind === 'ooo' && e.status === 'active') {
      const until = parseDate(signal.payload['until']) ?? new Date(now.getTime() + OOO_DEFAULT_MS);
      patch.status = 'paused';
      patch.pauseReason = 'ooo';
      patch.pausedUntil = until;
      scope.raise({ type: 'enrollment.paused', projectId: e.projectId, enrollmentId: e.id, payload: { enrollment: enrollmentPayload({ ...e, ...patch } as Enrollment), pause_reason: 'ooo', paused_until: until.toISOString() } });
      effect = 'paused';
      detail['until'] = until.toISOString();
    } else if (e.waiting) {
      const name = wakeEventNames(signal).find((n) => n in e.waiting!.events);
      const target = name ? e.waiting.events[name] : undefined;
      if (name && target) {
        await repos.runs.patchResult(e.waiting.runId, { woken_by: signal.id });
        await repos.runs.update(e.waiting.runId, { status: 'done', branch: name, finishedAt: now });
        patch.currentNodeId = target;
        patch.waiting = null;
        patch.nextRunAt = now;
        woken = true;
        effect = 'woken';
        detail['event'] = name;
      }
    }
  }

  if (Object.keys(patch).length) await repos.enrollments.update(e.id, patch);
  await repos.signals.recordEffect(signal.id, e.id, effect, detail);
  return { credit, woken };
}

async function chosenExit(repos: Repositories, signal: Signal, e: Enrollment): Promise<string | null> {
  if (!REPLY_KINDS.includes(signal.kind) && signal.kind !== 'meeting_booked') return null;
  const def = await loadDefinition(repos, e.projectId, e.versionId);
  return chosenExitReason(signal, def.exit_on);
}


function parseDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
