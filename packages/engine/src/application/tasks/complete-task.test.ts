import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestDb, migrateTestDb } from '../../test/db.js';
import { makeDeps, seedCallTask, seedEnrollment, seedTouch, seedWorld } from '../../test/signals-tasks-fixtures.js';
import { ingestInboundEvents } from '../signals/ingest-inbound-events.js';
import { processSignal } from '../signals/process-signal.js';
import { SIGNAL_QUEUE } from '../signals/record-signal.js';
import { exitEnrollment } from '../enrollments/exit-enrollment.js';
import { JOBS } from '../scheduler/jobs.js';
import { cancelTask } from './cancel-task.js';
import { completeTask } from './complete-task.js';
import { pushDialerTasks } from './push-dialer-tasks.js';

const HOUR = 3_600_000;

describe('completeTask', () => {
  const deps = makeDeps();
  const repos = deps.uow.repos;
  beforeAll(migrateTestDb);
  afterAll(closeTestDb);

  it('a connected outcome follows branches_by_outcome and emits task_completed plus call_connected', async () => {
    const w = await seedWorld(deps, []);
    const now = deps.clock.now();
    const e = await seedEnrollment(deps, w);
    await seedTouch(deps, e, 'email', new Date(now.getTime() - HOUR));
    const task = await seedCallTask(deps, e);

    const done = await completeTask(deps, w.projectId, task.id, { outcome: 'connected', note: 'Great chat' }, 'client');
    expect(done.status).toBe('done');
    expect(done.outcome).toBe('connected');
    expect(done.note).toBe('Great chat');
    expect(done.completedAt).not.toBeNull();

    const run = (await repos.runs.byId(task.runId))!;
    expect(run.status).toBe('done');
    expect(run.branch).toBe('connected');
    const after = (await repos.enrollments.byId(e.id))!;
    expect(after.waiting).toBeNull();
    expect(after.currentNodeId).toBe('end_connected'); // advanced into the branch's end node
    expect(after.status).toBe('completed');

    const signals = await repos.signals.byContact(w.contact.id, 10);
    const kinds = signals.map((s) => s.kind).sort();
    expect(kinds).toEqual(['call_connected', 'task_completed']);
    const connected = signals.find((s) => s.kind === 'call_connected')!;
    expect(connected.channel).toBe('call');
    expect(connected.source).toBe('client');
    expect(connected.payload).toEqual({ run_id: task.runId });
    expect(signals.find((s) => s.kind === 'task_completed')!.payload).toEqual({ run_id: task.runId, outcome: 'connected', kind: 'call' });
    for (const s of signals) expect(deps.queue.sent).toContainEqual({ queue: SIGNAL_QUEUE, payload: { v: 1, signal_id: s.id } });

    // the connected call is a reply, credited to the task's own run
    await processSignal(deps, connected.id);
    const credited = (await repos.signals.byId(connected.id))!;
    expect(credited.attribution).toBe('direct');
    expect(credited.attributedRunId).toBe(task.runId);
    expect((await repos.enrollments.byId(e.id))!.repliedChannel).toBe('call');

    // completing again is a no-op
    const again = await completeTask(deps, w.projectId, task.id, { outcome: 'no_answer' }, 'client');
    expect(again.outcome).toBe('connected');
  });

  it('an outcome without a branch takes completed; cancelling takes no_answer', async () => {
    const w = await seedWorld(deps, []);
    const e = await seedEnrollment(deps, w);
    const task = await seedCallTask(deps, e, { onCompleted: null, onExpired: null });
    await completeTask(deps, w.projectId, task.id, { outcome: 'voicemail' }, 'poll');
    const after = (await repos.enrollments.byId(e.id))!;
    expect(after.status).toBe('completed');
    expect((await repos.signals.byContact(w.contact.id, 10)).map((s) => s.kind)).toEqual(['task_completed']);

    const w2 = await seedWorld(deps, []);
    const e2 = await seedEnrollment(deps, w2);
    const t2 = await seedCallTask(deps, e2);
    const cancelled = await cancelTask(deps, w2.projectId, t2.id);
    expect(cancelled.status).toBe('cancelled');
    expect((await repos.runs.byId(t2.runId))!.branch).toBe('no_answer');
    expect((await repos.enrollments.byId(e2.id))!.currentNodeId).toBe('end_done');
  });

  it('an outbound Allo call to the contact by the sender completes the open call task with the mapped outcome', async () => {
    const w = await seedWorld(deps, [], { allo: { outcome_map: { BUSY: 'voicemail' } } });
    const e = await seedEnrollment(deps, w);
    const task = await seedCallTask(deps, e);
    const [smsChannel] = await repos.senders.channels(w.sender.id);
    const base = { kind: 'call_completed' as const, occurredAt: deps.clock.now(), from: smsChannel!.address, to: w.contact.phone!, userEmail: w.sender.email! };

    // an inbound call and a call from an unknown number are ignored
    const ignored = await ingestInboundEvents(deps, w.projectId, 'allo', [
      { ...base, externalId: `cll-in-${e.id}`, direction: 'inbound', result: 'ANSWERED' },
      { ...base, externalId: `cll-x-${e.id}`, direction: 'outbound', from: '+10000000000', result: 'ANSWERED' },
    ]);
    expect(ignored).toEqual({ stored: 0, ignored: 2 });
    expect((await repos.tasks.byId(w.projectId, task.id))!.status).toBe('open');

    const counts = await ingestInboundEvents(deps, w.projectId, 'allo', [{ ...base, externalId: `cll-${e.id}`, direction: 'outbound', result: 'BUSY', summary: 'Line busy' }]);
    expect(counts).toEqual({ stored: 1, ignored: 0 });
    const done = (await repos.tasks.byId(w.projectId, task.id))!;
    expect(done.status).toBe('done');
    expect(done.outcome).toBe('voicemail');
    expect(done.note).toBe('Line busy');
    expect((await repos.signals.byContact(w.contact.id, 10)).map((s) => s.source)).toEqual(['allo']);
  });

  it('an exit through the API closes the waiting call step and cancels its open task', async () => {
    const w = await seedWorld(deps, []);
    const e = await seedEnrollment(deps, w);
    const task = await seedCallTask(deps, e);

    const exited = await exitEnrollment(deps, w.projectId, e.id, { label: 'Cancelled' });
    expect(exited.status).toBe('exited');
    expect((await repos.runs.byId(task.runId))!.status).toBe('done');
    expect((await repos.tasks.byId(w.projectId, task.id))!.status).toBe('cancelled');
  });

  it('the scheduler runs the dialer push', () => {
    expect(JOBS['dialer']).toBeDefined();
    expect(JOBS['dialer']!.periodMs).toBeLessThanOrEqual(60_000);
  });

  it('pushes unpushed dialer tasks to the sender\'s Allo queue once', async () => {
    const pushes: Array<{ idempotencyKey: string; number: string; senderId: string }> = [];
    const d = makeDeps();
    d.providers.dialer.pushNumbers = async (req) => {
      pushes.push({ idempotencyKey: req.idempotencyKey, number: req.numbers[0]!.number, senderId: req.channel.senderId });
      return { added: 1, skipped: [] };
    };
    const w = await seedWorld(d, []);
    const e = await seedEnrollment(d, w);
    const task = await seedCallTask(d, e);

    const first = await pushDialerTasks(d, 100);
    expect(first.pushed).toBeGreaterThanOrEqual(1);
    expect(pushes).toContainEqual({ idempotencyKey: task.id, number: w.contact.phone, senderId: w.sender.id });
    expect((await d.uow.repos.tasks.byId(w.projectId, task.id))!.dialerPushedAt).not.toBeNull();
    await pushDialerTasks(d, 100);
    expect(pushes.filter((p) => p.idempotencyKey === task.id)).toHaveLength(1); // not pushed twice
  });
});
