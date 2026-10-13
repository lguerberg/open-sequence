/**
 * advance(enrollmentId): the imperative shell around the pure interpreter (docs section 6.2).
 *
 * One transaction: lock the enrollment, refuse if an executor owns it, run the interpreter for up
 * to 25 logic steps, apply each effect, update the row. While a run is `running` the enrollment's
 * owner_run_id points at it and next_run_at is null, so the planner cannot see it; only the
 * executor that finishes the run hands it back. Nothing can expire while work is in flight, which
 * is what prevents a double send.
 */
import { ensureBuiltins, interpret, resolveContactTimezone, type InterpretContext } from '@opensequence/core';
import type { Enrollment } from '../../domain/entities.js';
import { makeFactReader } from '../../infrastructure/facts/fact-reader.js';
import type { Deps } from '../deps.js';
import { effectiveSettings } from '../projects/shared.js';
import { applyEffect } from './apply-effect.js';
import { finishEnrollment, loadDefinition, loadStepContext, templateContextFor } from './shared.js';

const MAX_STEPS = 25;

export interface AdvanceOptions {
  /** The planner's claim token: advance proceeds when the enrollment is unowned or owned by this token. */
  claimToken?: string;
}

export async function advanceEnrollment(deps: Deps, enrollmentId: string, opts: AdvanceOptions = {}): Promise<void> {
  ensureBuiltins();
  await deps.uow.transaction(async (scope) => {
    const { repos } = scope;
    const e = await repos.enrollments.lock(enrollmentId);
    if (!e || e.status !== 'active') return;
    if (e.ownerRunId && e.ownerRunId !== opts.claimToken) return; // an executor owns the step
    const now = deps.clock.now();
    const project = await repos.projects.byId(e.projectId);
    if (!project) return;
    const settings = effectiveSettings(project);
    const def = await loadDefinition(repos, e.projectId, e.versionId);
    const ctx = await loadStepContext(repos, e);
    const contactTz = resolveContactTimezone({ timezone: ctx.contact.timezone, phone: ctx.contact.phone, country: ctx.contact.country })?.zone ?? null;

    let state: Enrollment = { ...e, ownerRunId: null };
    const patch: Partial<Enrollment> = { ownerRunId: null, nextRunAt: null };

    // A timed wait or a task that came due: close the waiting run on its timeout branch first.
    if (state.waiting) {
      const w = state.waiting;
      await repos.runs.update(w.runId, { status: 'done', branch: 'timeout', finishedAt: now });
      const task = await repos.tasks.byRun(w.runId);
      if (task && task.status === 'open') {
        await repos.tasks.update(task.id, { status: 'expired' });
        scope.raise({ type: 'task.expired', projectId: e.projectId, enrollmentId: e.id, payload: { task: task.id } });
      }
      patch.waiting = null;
      state = { ...state, waiting: null };
      if (!w.onTimeout) {
        finishEnrollment(scope, state, patch, 'completed', null, now);
        await repos.enrollments.update(e.id, patch);
        return;
      }
      state = { ...state, currentNodeId: w.onTimeout };
      patch.currentNodeId = w.onTimeout;
    }

    for (let steps = 0; steps < MAX_STEPS; steps++) {
      const ictx: InterpretContext = {
        definition: def,
        state: {
          enrollmentId: state.id,
          versionId: state.versionId,
          contactId: state.contactId,
          senderId: state.senderId,
          currentNodeId: state.currentNodeId,
          touchCount: state.touchCount,
          lastTouchAt: state.lastTouchAt,
          status: 'active',
        },
        facts: makeFactReader({
          repos,
          crm: deps.providers.crm,
          projectId: e.projectId,
          contact: ctx.contact,
          sender: ctx.sender,
          channels: ctx.channels,
          enrollment: state,
          now,
          dealSelection: settings.crm?.deal_selection ?? 'newest_open',
        }),
        now,
        timing: { contactTz, senderTz: ctx.sender.timezone, random: Math.random },
        template: templateContextFor(deps, ctx, state, null),
        factLog: [],
      };
      const { effects } = await interpret(ictx);
      let stop = false;
      for (const effect of effects) {
        const out = await applyEffect(deps, scope, state, patch, effect, now);
        state = out.state;
        if (out.stop) {
          stop = true;
          break;
        }
      }
      if (stop) break;
      if (steps === MAX_STEPS - 1) patch.nextRunAt = now; // a long logic chain continues on the next tick
    }
    await repos.enrollments.update(e.id, patch);
  });
}
