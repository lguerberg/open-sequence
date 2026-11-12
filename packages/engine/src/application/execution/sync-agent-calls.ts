/**
 * The `calls` job: for every step parked on an agent call, ask the provider how the call went and,
 * once it is over, close the step on the outcome. The flow follows the outcome's own transition,
 * else `completed`, else the sequence ends there.
 *
 *   reached, transferred       a conversation happened: also a `call_connected` signal (a reply)
 *   not_interested, wrong_number
 *   do_not_call                also suppresses calls to the contact
 *   not_reached                voicemail, no answer or busy on every attempt, or the call was cancelled
 *
 * A call the contact asked to have returned (`callback_later`) stays open; the step's give-up time
 * (its `give_up_after`) ends the wait through advance, like any timed wait.
 */
import { AGENT_CALL_OUTCOMES, type AgentCallOutcome, type AgentCallState } from '@opensequence/core';
import type { Enrollment, Run } from '../../domain/entities.js';
import type { Deps } from '../deps.js';
import { advanceEnrollment } from '../enrollments/advance-enrollment.js';
import { enrollmentPayload, finishEnrollment } from '../enrollments/shared.js';
import { recordSignal } from '../signals/record-signal.js';
import { runPayload } from './shared.js';

/** Outcomes that end the call at the provider. */
const CLOSING: readonly string[] = AGENT_CALL_OUTCOMES.filter((o) => o !== 'not_reached');
const CONNECTED: readonly string[] = ['reached', 'transferred'];
const UNREACHED: readonly string[] = ['voicemail', 'no_answer', 'busy', 'failed'];
/** The provider stops calling after this many unanswered attempts and hands the call to a person. */
const MAX_ATTEMPTS = 3;

export interface SyncAgentCallsResult {
  checked: number;
  finished: number;
  errors: number;
}

/** The transition a call has earned, or null while the provider may still call. A call the provider no longer knows counts as not reached. */
export function agentCallOutcome(state: AgentCallState | null): AgentCallOutcome | null {
  if (!state) return 'not_reached';
  if (state.outcome && CLOSING.includes(state.outcome)) return state.outcome as AgentCallOutcome;
  if (state.status === 'closed') return 'not_reached';
  if (state.attempts >= MAX_ATTEMPTS && state.outcome && UNREACHED.includes(state.outcome)) return 'not_reached';
  return null;
}

export async function syncAgentCalls(deps: Deps, limit: number): Promise<SyncAgentCallsResult> {
  const result: SyncAgentCallsResult = { checked: 0, finished: 0, errors: 0 };
  for (const run of await deps.uow.repos.runs.waitingOnChannel('call', limit)) {
    if (!run.providerRef) continue;
    result.checked++;
    try {
      const state = await deps.providers.calls.get({ projectId: run.projectId, id: run.providerRef });
      const outcome = agentCallOutcome(state);
      if (outcome) {
        if (await finishAgentCall(deps, run, outcome, state)) result.finished++;
      } else if (state) {
        // Also moves the run to the back of the line, so one tick's limit never starves the rest.
        await deps.uow.repos.runs.patchResult(run.id, { call: snapshot(state) });
      }
    } catch (err) {
      result.errors++;
      deps.log.error({ runId: run.id, enrollmentId: run.enrollmentId, err }, `reading agent call ${run.providerRef} failed`);
    }
  }
  return result;
}

/** Close a parked call step on its outcome and continue the flow. False when the step was no longer waiting (exited, timed out). */
export async function finishAgentCall(deps: Deps, run: Run, outcome: AgentCallOutcome, state: AgentCallState | null): Promise<boolean> {
  const now = deps.clock.now();
  let advance = false;
  const finished = await deps.uow.transaction(async (scope) => {
    const { repos } = scope;
    const e = await repos.enrollments.lock(run.enrollmentId);
    if (!e || e.waiting?.runId !== run.id) return false;
    await repos.runs.update(run.id, { status: 'done', branch: outcome, finishedAt: now, result: { ...run.result, ...(state ? { call: snapshot(state) } : {}) } });
    const target = run.next[outcome] ?? run.next['completed'];
    const patch: Partial<Enrollment> = { waiting: null };
    if (target) {
      patch.currentNodeId = target;
      patch.nextRunAt = now;
      advance = true;
    } else {
      finishEnrollment(scope, e, patch, 'completed', null, now);
    }
    await repos.enrollments.update(e.id, patch);
    scope.raise({ type: 'run.done', projectId: run.projectId, enrollmentId: e.id, payload: { run: runPayload({ ...run, status: 'done', branch: outcome }), enrollment: enrollmentPayload({ ...e, ...patch } as Enrollment) } });

    if (outcome === 'do_not_call') await repos.contacts.suppress(run.projectId, e.contactId, 'call', 'do_not_call');
    if (CONNECTED.includes(outcome)) {
      await recordSignal(deps, scope, { projectId: run.projectId, contactId: e.contactId, kind: 'call_connected', channel: 'call', source: run.provider ?? 'allo', externalId: `run:${run.id}:connected`, occurredAt: now, payload: { run_id: run.id, outcome } });
    }
    return true;
  });
  if (advance) await advanceEnrollment(deps, run.enrollmentId);
  return finished;
}

function snapshot(state: AgentCallState): Record<string, unknown> {
  return { attempts: state.attempts, last_outcome: state.outcome, last_call_id: state.lastCallId };
}
