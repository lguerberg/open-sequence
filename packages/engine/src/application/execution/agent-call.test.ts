import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgentCallProvider, AgentCallState } from '@opensequence/core';
import type { Enrollment, Run } from '../../domain/entities.js';
import { closeTestDb, migrateTestDb } from '../../test/db.js';
import { makeDeps, seedEnrollment, seedWorld, stubProviders, type World } from '../../test/signals-tasks-fixtures.js';
import { advanceEnrollment } from '../enrollments/advance-enrollment.js';
import { JOBS } from '../scheduler/jobs.js';
import { executors } from './consume-step-message.js';
import { executeCallStep } from './execute-call-step.js';
import { agentCallOutcome, syncAgentCalls } from './sync-agent-calls.js';

/** An in-memory agent: every created call stays open until the test sets how it went. */
class FakeAgent implements AgentCallProvider {
  created: Array<Parameters<AgentCallProvider['create']>[0]> = [];
  calls = new Map<string, AgentCallState>();
  failNext: Error | null = null;
  async create(req: Parameters<AgentCallProvider['create']>[0]): Promise<AgentCallState> {
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = null;
      throw err;
    }
    this.created.push(req);
    const state: AgentCallState = { id: `tsk-${this.created.length}-${req.idempotencyKey}`, status: 'open', outcome: null, attempts: 0, lastCallId: null };
    this.calls.set(state.id, state);
    return state;
  }
  async get(req: { id: string }): Promise<AgentCallState | null> {
    return this.calls.get(req.id) ?? null;
  }
  async find(req: { to: string; title: string }): Promise<AgentCallState | null> {
    const hit = this.created.findLast((c) => c.to === req.to && c.title === req.title);
    return hit ? ([...this.calls.values()].find((s) => s.id.endsWith(hit.idempotencyKey)) ?? null) : null;
  }
  async listAgents() {
    return [];
  }
}

const NEXT = { reached: 'end_reached', not_reached: 'end_not_reached', completed: 'end_other', skipped: 'end_skipped' };

function definition(params: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    entry: 'ai_call',
    settings: { reenroll: 'always' },
    exit_on: [],
    nodes: {
      ai_call: {
        type: 'outreach',
        channel: 'call',
        action: 'agent_call',
        params: { agent_id: 'agt-1', title: 'Confirm the demo with {{ contact.first_name | "them" }}', description: 'Ask {{ contact.first_name | "them" }} if Friday works.', skills: { sms: { text: 'Hi {{ contact.first_name | "them" }}' }, transfer: { type: 'member', user_id: 'usr-9' } }, give_up_after: '2d', ...params },
        next: NEXT,
      },
      end_reached: { type: 'end', params: { label: 'Reached' } },
      end_not_reached: { type: 'end', params: { label: 'Not reached' } },
      end_other: { type: 'end' },
      end_skipped: { type: 'end' },
    },
  };
}

describe('agent call step', () => {
  const agent = new FakeAgent();
  const deps = makeDeps({ providers: stubProviders({ calls: agent }), optOutToken: () => 'token', optOutVerify: () => null });
  const repos = deps.uow.repos;
  beforeAll(migrateTestDb);
  afterAll(closeTestDb);

  /** A world whose published version is the call sequence, with one enrollment the executor owns. */
  async function start(contactPatch: Record<string, unknown> = {}, params: Record<string, unknown> = {}): Promise<{ w: World; e: Enrollment; run: Run }> {
    const w = await seedWorld(deps, []);
    const versionId = deps.ids.next('version');
    await repos.sequences.createVersion({ id: versionId, projectId: w.projectId, sequenceId: w.sequenceId, tag: 'v2', status: 'published', definition: definition(params), schemaVersion: 1, lockVersion: 0, basedOnVersionId: null, createdBy: null, publishedBy: null, publishedAt: new Date(), archivedAt: null });
    if (Object.keys(contactPatch).length) await repos.contacts.patch(w.projectId, w.contact.id, contactPatch, false);
    const e = await seedEnrollment(deps, { ...w, versionId }, { currentNodeId: 'ai_call' });
    const now = deps.clock.now();
    const run = await repos.runs.insert({
      id: deps.ids.next('run'), projectId: e.projectId, enrollmentId: e.id, sequenceId: e.sequenceId, versionId, nodeId: 'ai_call', nodeType: 'outreach', channel: 'call', action: 'agent_call',
      touchNumber: null, attempt: 1, status: 'running', idempotencyKey: `seq:${e.id}:ai_call:a1`, next: NEXT, startedAt: now, finishedAt: null, provider: null, providerRef: null, threadRef: null, branch: null, result: {}, error: null, senderId: e.senderId, enqueuedAt: now,
    });
    await repos.enrollments.update(e.id, { ownerRunId: run.id, nextRunAt: null });
    return { w, e, run };
  }

  it('is registered as the seq_call executor and has a job that reads results', () => {
    expect(executors.get('seq_call')).toBe(executeCallStep);
    expect(JOBS['calls']).toBeDefined();
  });

  it('asks the agent to call the contact from the sender\'s Allo number, then parks the step until the give-up time', async () => {
    const { w, e, run } = await start();
    expect(await executeCallStep(deps, run.id, 1)).toBe('done');

    const senderLine = (await repos.senders.channel(w.sender.id, 'sms'))!.address;
    const sent = agent.created.at(-1)!;
    expect(sent).toMatchObject({ projectId: w.projectId, agentId: 'agt-1', from: senderLine, to: w.contact.phone, title: 'Confirm the demo with Sam', description: 'Ask Sam if Friday works.', skills: { sms: { text: 'Hi Sam' }, transfer: { type: 'member', userId: 'usr-9' } } });

    const parked = (await repos.runs.byId(run.id))!;
    expect(parked.status).toBe('waiting');
    expect(parked.provider).toBe('allo');
    expect(parked.providerRef).toMatch(/^tsk-/);
    expect(parked.touchNumber).toBe(1);
    const after = (await repos.enrollments.byId(e.id))!;
    expect(after.ownerRunId).toBeNull();
    expect(after.waiting).toEqual({ runId: run.id, events: {}, onTimeout: 'end_not_reached' });
    expect(after.touchCount).toBe(1);
    const waitMs = after.nextRunAt!.getTime() - Date.now();
    expect(waitMs).toBeGreaterThan(47 * 3_600_000);
    expect(waitMs).toBeLessThan(49 * 3_600_000);
  });

  it('a reached call follows `reached` and counts as a connected call', async () => {
    const { w, e, run } = await start();
    await executeCallStep(deps, run.id, 1);
    const ref = (await repos.runs.byId(run.id))!.providerRef!;

    // one unanswered attempt: nothing changes yet
    Object.assign(agent.calls.get(ref)!, { attempts: 1, outcome: 'voicemail' });
    await syncAgentCalls(deps, 500);
    expect((await repos.runs.byId(run.id))!.status).toBe('waiting');
    expect((await repos.runs.byId(run.id))!.result['call']).toMatchObject({ attempts: 1, last_outcome: 'voicemail' });

    Object.assign(agent.calls.get(ref)!, { attempts: 2, outcome: 'reached', status: 'closed', lastCallId: 'cal-7' });
    await syncAgentCalls(deps, 500);
    const done = (await repos.runs.byId(run.id))!;
    expect(done.status).toBe('done');
    expect(done.branch).toBe('reached');
    expect(done.result['call']).toEqual({ attempts: 2, last_outcome: 'reached', last_call_id: 'cal-7' });
    const after = (await repos.enrollments.byId(e.id))!;
    expect(after.currentNodeId).toBe('end_reached');
    expect(after.status).toBe('completed');
    const signals = await repos.signals.byContact(w.contact.id, 10);
    expect(signals.map((s) => s.kind)).toEqual(['call_connected']);
    expect(signals[0]!.payload).toEqual({ run_id: run.id, outcome: 'reached' });

    // a second look changes nothing
    await syncAgentCalls(deps, 500);
    expect((await repos.signals.byContact(w.contact.id, 10)).length).toBe(1);
  });

  it('do_not_call suppresses calls and, with no wire of its own, follows `completed`', async () => {
    const { w, e, run } = await start();
    await executeCallStep(deps, run.id, 1);
    Object.assign(agent.calls.get((await repos.runs.byId(run.id))!.providerRef!)!, { attempts: 1, outcome: 'do_not_call', status: 'closed' });
    await syncAgentCalls(deps, 500);
    expect((await repos.runs.byId(run.id))!.branch).toBe('do_not_call');
    expect((await repos.enrollments.byId(e.id))!.currentNodeId).toBe('end_other');
    expect((await repos.contacts.suppressions(w.contact.id)).map((s) => [s.channel, s.reason])).toEqual([['call', 'do_not_call']]);

    // the next call step for this contact is skipped without calling
    const before = agent.created.length;
    const versionId = e.versionId;
    const e2 = await seedEnrollment(deps, { ...w, versionId }, { currentNodeId: 'ai_call' });
    const run2 = await repos.runs.insert({ ...(await repos.runs.byId(run.id))!, id: deps.ids.next('run'), enrollmentId: e2.id, idempotencyKey: `seq:${e2.id}:ai_call:a1`, status: 'running', branch: null, finishedAt: null, providerRef: null, result: {} });
    await repos.enrollments.update(e2.id, { ownerRunId: run2.id });
    expect(await executeCallStep(deps, run2.id, 1)).toBe('skipped');
    expect(agent.created.length).toBe(before);
    expect((await repos.runs.byId(run2.id))!.result['skip_reason']).toBe('suppressed');
  });

  it('three unanswered attempts follow `not_reached`', async () => {
    const { e, run } = await start();
    await executeCallStep(deps, run.id, 1);
    Object.assign(agent.calls.get((await repos.runs.byId(run.id))!.providerRef!)!, { attempts: 3, outcome: 'no_answer' });
    await syncAgentCalls(deps, 500);
    expect((await repos.runs.byId(run.id))!.branch).toBe('not_reached');
    expect((await repos.enrollments.byId(e.id))!.currentNodeId).toBe('end_not_reached');
  });

  it('the give-up time ends the wait on `not_reached`', async () => {
    const { e, run } = await start();
    await executeCallStep(deps, run.id, 1);
    await advanceEnrollment(deps, e.id); // what the planner does when next_run_at comes due
    expect((await repos.runs.byId(run.id))!.branch).toBe('timeout');
    expect((await repos.enrollments.byId(e.id))!.currentNodeId).toBe('end_not_reached');
    // the call may still end later at the provider: it no longer moves anything
    Object.assign(agent.calls.get((await repos.runs.byId(run.id))!.providerRef!)!, { attempts: 1, outcome: 'reached', status: 'closed' });
    await syncAgentCalls(deps, 500);
    expect((await repos.runs.byId(run.id))!.branch).toBe('timeout');
  });

  it('skips without calling when the contact has not consented or has no phone', async () => {
    const before = agent.created.length;
    const noConsent = await start({ outreachConsent: false });
    expect(await executeCallStep(deps, noConsent.run.id, 1)).toBe('skipped');
    expect((await repos.runs.byId(noConsent.run.id))!.result['skip_reason']).toBe('no_consent');
    expect((await repos.enrollments.byId(noConsent.e.id))!.currentNodeId).toBe('end_skipped');
    const noPhone = await start({ phone: null });
    expect(await executeCallStep(deps, noPhone.run.id, 1)).toBe('skipped');
    expect((await repos.runs.byId(noPhone.run.id))!.result['skip_reason']).toBe('no_phone');
    expect(agent.created.length).toBe(before);
  });

  it('a line fixed on the step wins over the sender\'s; a sender with no Allo number is skipped', async () => {
    const fixed = await start({}, { allo_number: '+14155550199' });
    expect(await executeCallStep(deps, fixed.run.id, 1)).toBe('done');
    expect(agent.created.at(-1)!.from).toBe('+14155550199');

    const noLine = await start();
    await repos.senders.deleteChannel(noLine.w.sender.id, 'sms');
    const before = agent.created.length;
    expect(await executeCallStep(deps, noLine.run.id, 1)).toBe('skipped');
    expect((await repos.runs.byId(noLine.run.id))!.result['skip_reason']).toBe('no_allo_number');
    expect(agent.created.length).toBe(before);
  });

  it('a retry finds the call it already created instead of calling twice', async () => {
    const { run } = await start();
    // first attempt: the call is created but the worker dies before parking the step
    const req = { projectId: run.projectId, agentId: 'agt-1', from: 'any', to: (await repos.contacts.byId(run.projectId, (await repos.enrollments.byId(run.enrollmentId))!.contactId))!.phone!, title: 'Confirm the demo with Sam', idempotencyKey: run.idempotencyKey };
    const first = await agent.create(req);
    const before = agent.created.length;
    expect(await executeCallStep(deps, run.id, 2)).toBe('done');
    expect(agent.created.length).toBe(before);
    expect((await repos.runs.byId(run.id))!.providerRef).toBe(first.id);
  });

  it('an unknown error retries; a wrong line fails the step', async () => {
    const a = await start();
    agent.failNext = new Error('socket hang up');
    expect(await executeCallStep(deps, a.run.id, 1)).toBe('retry');
    expect((await repos.runs.byId(a.run.id))!.status).toBe('running');

    const b = await start();
    agent.failNext = Object.assign(new Error("LINE_NOT_AGENT_CALLING_LINE: The Outbound agent 'agt-1' does not call from '+14155550100'."), { status: 400 });
    expect(await executeCallStep(deps, b.run.id, 1)).toBe('failed');
    const failed = (await repos.runs.byId(b.run.id))!;
    expect(failed.status).toBe('failed');
    expect(failed.error).toMatch(/^LINE_NOT_AGENT_CALLING_LINE/);
    expect((await repos.enrollments.byId(b.e.id))!.status).toBe('paused');
  });
});

describe('agentCallOutcome', () => {
  const s = (p: Partial<AgentCallState>): AgentCallState => ({ id: 'tsk-1', status: 'open', outcome: null, attempts: 0, lastCallId: null, ...p });
  it.each([
    [s({}), null],
    [s({ attempts: 1, outcome: 'voicemail' }), null],
    [s({ attempts: 2, outcome: 'callback_later' }), null],
    [s({ attempts: 3, outcome: 'callback_later' }), null],
    [s({ attempts: 3, outcome: 'busy' }), 'not_reached'],
    [s({ attempts: 1, outcome: 'transferred' }), 'transferred'],
    [s({ attempts: 1, outcome: 'wrong_number', status: 'closed' }), 'wrong_number'],
    [s({ attempts: 1, outcome: 'ended_without_outcome', status: 'closed' }), 'not_reached'],
    [s({ status: 'closed' }), 'not_reached'],
    [null, 'not_reached'],
  ])('%j -> %s', (state, expected) => expect(agentCallOutcome(state)).toBe(expected));
});
