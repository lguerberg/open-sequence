/**
 * What every executor shares: the gates a step must pass, the throttle, and the four ways a run
 * can finish (done, skipped, deferred, failed), each of which hands the enrollment back and calls
 * advance so the flow continues without waiting for a planner tick.
 */
import { isInsideWindow, nextInsideWindow, registry, resolveContactTimezone, SMS_WINDOW } from '@opensequence/core';
import type { Enrollment, Run } from '../../domain/entities.js';
import type { TransactionScope } from '../../domain/repositories.js';
import type { Deps } from '../deps.js';
import { advanceEnrollment } from '../enrollments/advance-enrollment.js';
import { enrollmentPayload, finishEnrollment, loadDefinition, loadStepContext, templateContextFor, type StepContext } from '../enrollments/shared.js';
import { channelEnabled } from '../projects/channel-enabled.js';
import { effectiveSettings, type EffectiveSettings } from '../projects/shared.js';

export interface StepEnv {
  run: Run;
  enrollment: Enrollment;
  ctx: StepContext;
  settings: EffectiveSettings;
  template: ReturnType<typeof templateContextFor>;
  contactTz: string | null;
}

/** Load everything an executor needs, or null when the run is stale (finished, or the enrollment moved on). */
export async function loadStep(deps: Deps, runId: string): Promise<StepEnv | null> {
  const repos = deps.uow.repos;
  const run = await repos.runs.byId(runId);
  if (!run || run.status !== 'running') return null;
  const enrollment = await repos.enrollments.byId(run.enrollmentId);
  if (!enrollment || enrollment.ownerRunId !== run.id) return null;
  const project = await repos.projects.byId(run.projectId);
  if (!project) return null;
  const ctx = await loadStepContext(repos, enrollment);
  const contactTz = resolveContactTimezone({ timezone: ctx.contact.timezone, phone: ctx.contact.phone, country: ctx.contact.country })?.zone ?? null;
  return { run, enrollment, ctx, settings: effectiveSettings(project), template: templateContextFor(deps, ctx, enrollment, run.id), contactTz };
}

export type Gate = { ok: true } | { ok: false; skip: string } | { ok: false; defer: Date; reason: string };

/** The send window of the sequence (or the hard SMS window), evaluated now. */
export async function windowGate(deps: Deps, env: StepEnv, channel: 'email' | 'sms', now: Date): Promise<Gate> {
  const def = await loadDefinition(deps.uow.repos, env.run.projectId, env.enrollment.versionId);
  const zoneChoice = def.settings.send_window?.tz ?? 'contact';
  const zone = (zoneChoice === 'contact' && env.contactTz) || env.ctx.sender.timezone;
  if (def.settings.send_window && !isInsideWindow(now, def.settings.send_window, zone)) {
    return { ok: false, defer: nextInsideWindow(now, def.settings.send_window, zone), reason: 'send_window' };
  }
  if (channel === 'sms') {
    if (!env.contactTz) return { ok: false, skip: 'no_timezone' };
    if (!isInsideWindow(now, SMS_WINDOW, env.contactTz)) return { ok: false, defer: nextInsideWindow(now, SMS_WINDOW, env.contactTz), reason: 'quiet_hours' };
  }
  return { ok: true };
}

/** Kill switches, the sender's channel, and the channel's rolling daily cap and minimum gap. */
export async function channelGate(deps: Deps, env: StepEnv, channel: string, now: Date): Promise<Gate> {
  if (!(await channelEnabled(deps, env.run.projectId, channel))) return { ok: false, defer: new Date(now.getTime() + 5 * 60_000), reason: 'kill_switch' };
  const ch = env.ctx.channels.find((c) => c.channel === channel);
  if (!ch) return { ok: false, skip: channel === 'email' ? 'google_not_connected' : `no_${channel}_channel` };
  if (ch.status !== 'active') return { ok: false, skip: `sender_channel_${ch.status}` };
  const repos = deps.uow.repos;
  if (ch.dailyLimit !== null) {
    const sent = await repos.senders.sentCount(env.ctx.sender.id, channel, new Date(now.getTime() - 86_400_000));
    if (sent >= ch.dailyLimit) return { ok: false, defer: new Date(now.getTime() + 60 * 60_000), reason: 'daily_limit' };
  }
  if (ch.minGapSeconds > 0) {
    const last = await repos.senders.lastSentAt(env.ctx.sender.id, channel);
    if (last && now.getTime() - last.getTime() < ch.minGapSeconds * 1000) {
      return { ok: false, defer: new Date(last.getTime() + ch.minGapSeconds * 1000), reason: 'min_gap' };
    }
  }
  return { ok: true };
}

export function queueFor(channel: string): string {
  return registry.channel(channel)?.queue ?? `seq_${channel}`;
}

async function handBack(deps: Deps, scope: TransactionScope, run: Run, patch: Partial<Enrollment>): Promise<Enrollment | null> {
  const e = await scope.repos.enrollments.lock(run.enrollmentId);
  if (!e || e.ownerRunId !== run.id) return null;
  return scope.repos.enrollments.update(e.id, { ...patch, ownerRunId: null });
}

/** The side effect happened: record it as a touch, follow `sent`, continue the flow. */
export async function completeRun(deps: Deps, run: Run, result: { provider: string; providerRef: string | null; threadRef: string | null; result: Record<string, unknown> }, now: Date): Promise<void> {
  let advance = false;
  await deps.uow.transaction(async (scope) => {
    const e = await scope.repos.enrollments.lock(run.enrollmentId);
    if (!e || e.ownerRunId !== run.id) return;
    const touchNumber = e.touchCount + 1;
    await scope.repos.runs.update(run.id, { status: 'done', branch: 'sent', finishedAt: now, touchNumber, ...result });
    const target = run.next['sent'];
    const patch: Partial<Enrollment> = { touchCount: touchNumber, lastTouchAt: now, ownerRunId: null, nextRunAt: target ? now : null };
    if (target) patch.currentNodeId = target;
    else finishEnrollment(scope, { ...e, touchCount: touchNumber, lastTouchAt: now }, patch, 'completed', null, now);
    await scope.repos.enrollments.update(e.id, patch);
    scope.raise({ type: 'run.done', projectId: run.projectId, enrollmentId: e.id, payload: { run: runPayload({ ...run, status: 'done', touchNumber }), enrollment: enrollmentPayload({ ...e, ...patch } as Enrollment) } });
    advance = !!target;
  });
  if (advance) await advanceEnrollment(deps, run.enrollmentId);
}

/** A gate failed for good: not a touch; follow `skipped`, else continue like `sent`. */
export async function skipRun(deps: Deps, run: Run, reason: string, now: Date): Promise<void> {
  let advance = false;
  await deps.uow.transaction(async (scope) => {
    await scope.repos.runs.update(run.id, { status: 'skipped', branch: 'skipped', finishedAt: now, result: { ...run.result, skip_reason: reason } });
    const target = run.next['skipped'] ?? run.next['sent'];
    const e = await handBack(deps, scope, run, { currentNodeId: target ?? run.nodeId, nextRunAt: target ? now : null });
    if (!e) return;
    if (!target) {
      const patch: Partial<Enrollment> = {};
      finishEnrollment(scope, e, patch, 'completed', null, now);
      await scope.repos.enrollments.update(e.id, patch);
    }
    scope.raise({ type: 'run.skipped', projectId: run.projectId, enrollmentId: run.enrollmentId, payload: { run: runPayload(run), reason } });
    advance = !!target;
  });
  if (advance) await advanceEnrollment(deps, run.enrollmentId);
}

/** Try again at `at`: the run stays the same row (one run per step), the enrollment goes back to the planner. */
export async function deferRun(deps: Deps, run: Run, at: Date, reason: string): Promise<void> {
  await deps.uow.transaction(async (scope) => {
    await scope.repos.runs.update(run.id, { status: 'deferred', result: { ...run.result, deferred: reason, retry_at: at.toISOString() } });
    await handBack(deps, scope, run, { nextRunAt: at, status: reason === 'daily_limit' ? 'waiting_limit' : 'active' });
  });
}

/** Out of retries: follow `failed` if wired, otherwise pause the enrollment with step_failed. */
export async function failRun(deps: Deps, run: Run, error: string, now: Date): Promise<void> {
  let advance = false;
  await deps.uow.transaction(async (scope) => {
    await scope.repos.runs.update(run.id, { status: 'failed', branch: 'failed', finishedAt: now, error });
    const target = run.next['failed'];
    const e = await handBack(deps, scope, run, target ? { currentNodeId: target, nextRunAt: now } : { status: 'paused', pauseReason: 'step_failed', nextRunAt: null });
    if (!e) return;
    scope.raise({ type: 'run.failed', projectId: run.projectId, enrollmentId: run.enrollmentId, payload: { run: runPayload(run), error } });
    if (!target) scope.raise({ type: 'enrollment.paused', projectId: run.projectId, enrollmentId: e.id, payload: { enrollment: enrollmentPayload(e), pause_reason: 'step_failed' } });
    advance = !!target;
  });
  if (advance) await advanceEnrollment(deps, run.enrollmentId);
}

/** The outcome is unknown (a text may or may not have left): stop and let a human decide. */
export async function needsReview(deps: Deps, run: Run, error: string, now: Date): Promise<void> {
  await deps.uow.transaction(async (scope) => {
    await scope.repos.runs.update(run.id, { status: 'needs_review', error, finishedAt: now });
    scope.raise({ type: 'run.needs_review', projectId: run.projectId, enrollmentId: run.enrollmentId, payload: { run: runPayload(run), error } });
  });
}

export function runPayload(r: Run): Record<string, unknown> {
  return { id: r.id, node_id: r.nodeId, node_type: r.nodeType, channel: r.channel, action: r.action, status: r.status, touch_number: r.touchNumber, provider: r.provider, provider_ref: r.providerRef, branch: r.branch, enrollment: r.enrollmentId };
}
