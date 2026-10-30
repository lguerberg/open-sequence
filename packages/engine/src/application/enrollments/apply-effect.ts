/**
 * Applies one interpreter effect to the enrollment inside advance's transaction. Returns the new
 * in-memory state and whether the step loop must stop (something external now owns the flow).
 */
import type { Effect } from '@opensequence/core';
import type { Enrollment } from '../../domain/entities.js';
import type { TransactionScope } from '../../domain/repositories.js';
import type { Deps } from '../deps.js';
import { finishEnrollment, insertRun, runKey, taskPayload } from './shared.js';

export interface ApplyOutcome {
  state: Enrollment;
  stop: boolean;
}

export async function applyEffect(deps: Deps, scope: TransactionScope, state: Enrollment, patch: Partial<Enrollment>, effect: Effect, now: Date): Promise<ApplyOutcome> {
  const { repos, raise } = scope;
  const dry = state.mode === 'dry_run';
  const end = (status: 'completed' | 'exited', reason: string | null = null): ApplyOutcome => {
    finishEnrollment(scope, state, patch, status, reason, now);
    return { state: { ...state, status }, stop: true };
  };
  const moveTo = (nodeId: string | undefined): ApplyOutcome => {
    if (!nodeId) return end('completed');
    patch.currentNodeId = nodeId;
    return { state: { ...state, currentNodeId: nodeId }, stop: false };
  };

  switch (effect.kind) {
    case 'record':
      await insertRun(deps, repos, state, effect.run, effect.status, effect.branch ?? null, now, true);
      return { state, stop: false };

    case 'goto': {
      patch.currentNodeId = effect.nodeId;
      const next = { ...state, currentNodeId: effect.nodeId };
      if (effect.at && effect.at.getTime() > now.getTime()) {
        patch.nextRunAt = effect.at;
        if (effect.deferred) patch.deferral = { nodeId: effect.nodeId, until: effect.at.toISOString() };
        return { state: next, stop: true };
      }
      return { state: next, stop: false };
    }

    case 'enqueue': {
      if (dry) {
        await insertRun(deps, repos, state, effect.run, 'skipped_dry_run', 'sent', now, true);
        return moveTo(effect.run.next['sent']);
      }
      const run = await repos.runs.upsertByKey({
        id: deps.ids.next('run'),
        projectId: state.projectId,
        enrollmentId: state.id,
        sequenceId: state.sequenceId,
        versionId: state.versionId,
        nodeId: effect.run.nodeId,
        nodeType: effect.run.nodeType,
        channel: effect.run.channel ?? null,
        action: effect.run.action ?? null,
        touchNumber: null,
        attempt: 1,
        status: 'running',
        idempotencyKey: runKey(state.id, effect.run.nodeId, 1),
        next: effect.run.next,
        startedAt: now,
        finishedAt: null,
        provider: null,
        providerRef: null,
        threadRef: null,
        branch: null,
        result: effect.run.result,
        error: null,
        senderId: state.senderId,
        enqueuedAt: null,
      });
      await deps.queue.send(effect.queue, { v: 1, run_id: run.id }, { tx: scope.tx });
      await repos.runs.update(run.id, { enqueuedAt: now });
      patch.ownerRunId = run.id;
      patch.nextRunAt = null;
      return { state: { ...state, ownerRunId: run.id }, stop: true };
    }

    case 'create_task': {
      if (dry) {
        await insertRun(deps, repos, state, effect.run, 'skipped_dry_run', 'completed', now, true);
        return moveTo(effect.task.onCompleted);
      }
      const run = await insertRun(deps, repos, state, effect.run, 'waiting', null, now, false);
      const t = effect.task;
      const task = await repos.tasks.insert({
        id: deps.ids.next('task'),
        projectId: state.projectId,
        enrollmentId: state.id,
        runId: run.id,
        senderId: state.senderId,
        contactId: state.contactId,
        kind: t.kind,
        title: t.title,
        body: t.body ?? null,
        link: t.link ?? null,
        dueAt: t.dueAt,
        expiresAt: t.expiresAt,
        status: 'open',
        outcome: null,
        note: null,
        connectedOutcomes: [...t.connectedOutcomes],
        branchesByOutcome: t.branchesByOutcome,
        onCompleted: t.onCompleted ?? null,
        onExpired: t.onExpired ?? null,
        dialer: t.dialer,
        autoComplete: t.autoComplete,
        dialerPushedAt: null,
        completeOnOpen: t.completeOnOpen ?? null,
        openedAt: null,
        completedAt: null,
      });
      patch.waiting = { runId: run.id, events: {}, onTimeout: t.onExpired };
      patch.nextRunAt = t.expiresAt;
      raise({ type: 'task.created', projectId: state.projectId, enrollmentId: state.id, payload: { task: taskPayload(task) } });
      return { state: { ...state, waiting: patch.waiting }, stop: true };
    }

    case 'wait': {
      const run = await insertRun(deps, repos, state, effect.run, 'waiting', null, now, false);
      patch.waiting = { runId: run.id, events: effect.events, onTimeout: effect.onTimeout };
      patch.nextRunAt = effect.until;
      return { state: { ...state, waiting: patch.waiting }, stop: true };
    }

    case 'exit':
      return end('exited', effect.reason);

    case 'complete':
      return end('completed');
  }
}
