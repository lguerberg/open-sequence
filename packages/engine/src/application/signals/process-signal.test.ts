import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestDb, migrateTestDb } from '../../test/db.js';
import { makeDeps, seedEnrollment, seedTouch, seedWait, seedWorld } from '../../test/signals-tasks-fixtures.js';
import { processSignal } from './process-signal.js';
import { recordSignal, SIGNAL_QUEUE } from './record-signal.js';
import { reportClientEvent } from './report-client-event.js';

const HOUR = 3_600_000;
const DAY = 86_400_000;

describe('processSignal', () => {
  const deps = makeDeps();
  const repos = deps.uow.repos;
  beforeAll(migrateTestDb);
  afterAll(closeTestDb);

  it('a reply exits an enrollment whose definition lists reply in exit_on, credited to the email touch', async () => {
    const w = await seedWorld(deps, ['reply']);
    const now = deps.clock.now();
    const e = await seedEnrollment(deps, w);
    const touch = await seedTouch(deps, e, 'email', new Date(now.getTime() - 2 * HOUR));
    const wait = await seedWait(deps, e, { reply: 'end_replied', call_connected: 'end_replied' }, 'call_1');

    const { signal, created } = await deps.uow.transaction((scope) =>
      recordSignal(deps, scope, { projectId: w.projectId, contactId: w.contact.id, kind: 'reply', channel: 'email', source: 'smtp', externalId: `msg-${e.id}`, occurredAt: now })
    );
    expect(created).toBe(true);
    expect(deps.queue.sent).toContainEqual({ queue: SIGNAL_QUEUE, payload: { v: 1, signal_id: signal.id } });
    await processSignal(deps, signal.id);

    const after = (await repos.enrollments.byId(e.id))!;
    expect(after.status).toBe('exited');
    expect(after.exitReason).toBe('replied');
    expect(after.exitSignalId).toBe(signal.id);
    expect(after.repliedAt?.toISOString()).toBe(now.toISOString());
    expect(after.repliedChannel).toBe('email');
    expect(after.waiting).toBeNull();
    expect((await repos.runs.byId(wait.id))?.branch).toBe('exit');
    const processed = (await repos.signals.byId(signal.id))!;
    expect(processed.processedAt).not.toBeNull();
    expect(processed.attribution).toBe('direct');
    expect(processed.attributedRunId).toBe(touch.id);
    expect(await repos.signals.hasEffect(signal.id, e.id)).toBe(true);

    // a redelivery changes nothing
    await processSignal(deps, signal.id);
    expect((await repos.enrollments.byId(e.id))!.updatedAt.toISOString()).toBe(after.updatedAt.toISOString());
  });

  it('a reply wakes a wait_for and the flow continues on the reply branch', async () => {
    const w = await seedWorld(deps, []);
    const now = deps.clock.now();
    const e = await seedEnrollment(deps, w);
    await seedTouch(deps, e, 'sms', new Date(now.getTime() - HOUR));
    const wait = await seedWait(deps, e, { reply: 'end_replied', call_connected: 'end_replied' }, 'call_1');

    const { signal } = await deps.uow.transaction((scope) =>
      recordSignal(deps, scope, { projectId: w.projectId, contactId: w.contact.id, kind: 'reply', channel: 'email', source: 'smtp', externalId: `msg-${e.id}`, occurredAt: now })
    );
    await processSignal(deps, signal.id);

    const run = (await repos.runs.byId(wait.id))!;
    expect(run.status).toBe('done');
    expect(run.branch).toBe('reply');
    expect(run.result['woken_by']).toBe(signal.id);
    const after = (await repos.enrollments.byId(e.id))!;
    expect(after.waiting).toBeNull();
    expect(after.currentNodeId).toBe('end_replied'); // advanced after commit into the end node
    expect(after.status).toBe('completed');
    expect(after.repliedChannel).toBe('email');
    // no same-channel touch before the reply: the sms touch gets assisted credit
    expect((await repos.signals.byId(signal.id))!.attribution).toBe('assisted');
  });

  it('a client opt-out suppresses the contact and exits whatever the definition says', async () => {
    const w = await seedWorld(deps, []);
    const e = await seedEnrollment(deps, w);
    await seedTouch(deps, e, 'email', new Date(deps.clock.now().getTime() - HOUR));
    await seedWait(deps, e, { reply: 'end_replied' }, 'call_1');

    const { signal } = await reportClientEvent(deps, w.projectId, w.contact.externalId, { id: `evt-${e.id}`, type: 'opt_out', reason: 'asked by phone' });
    expect(signal.kind).toBe('opt_out');
    expect(signal.channel).toBe('all');
    expect(signal.payload).toEqual({ reason: 'asked by phone' });
    const again = await reportClientEvent(deps, w.projectId, w.contact.id, { id: `evt-${e.id}`, type: 'opt_out' });
    expect(again.created).toBe(false);
    expect(again.signal.id).toBe(signal.id);

    await processSignal(deps, signal.id);
    expect(await repos.contacts.suppressions(w.contact.id)).toMatchObject([{ channel: 'all', reason: 'opt_out' }]);
    const after = (await repos.enrollments.byId(e.id))!;
    expect(after.status).toBe('exited');
    expect(after.exitReason).toBe('opt_out');
    expect(after.repliedAt).toBeNull();
    expect((await repos.signals.byId(signal.id))!.attribution).toBe('none');
  });

  it('a meeting is credited to the most recently touched enrollment, even one that already exited', async () => {
    const w = await seedWorld(deps, ['reply', 'meeting_booked']);
    const now = deps.clock.now();
    const older = await seedEnrollment(deps, w, { status: 'completed', finishedAt: new Date(now.getTime() - 9 * DAY) });
    await seedTouch(deps, older, 'email', new Date(now.getTime() - 10 * DAY));
    const recent = await seedEnrollment(deps, w, { status: 'exited', exitReason: 'replied', finishedAt: new Date(now.getTime() - DAY) });
    const touch = await seedTouch(deps, recent, 'email', new Date(now.getTime() - 2 * DAY));

    const { signal } = await reportClientEvent(deps, w.projectId, w.contact.id, { id: `cal-${recent.id}`, type: 'meeting_booked', data: { starts_at: '2026-10-20T15:00:00Z' } });
    await processSignal(deps, signal.id);

    const credited = (await repos.enrollments.byId(recent.id))!;
    expect(credited.meetingBookedAt?.toISOString()).toBe(signal.occurredAt.toISOString());
    expect(credited.meetingChannel).toBe('email');
    expect(credited.status).toBe('exited'); // stays as it was
    expect((await repos.enrollments.byId(older.id))!.meetingBookedAt).toBeNull();
    const s = (await repos.signals.byId(signal.id))!;
    expect(s.attribution).toBe('direct');
    expect(s.attributedRunId).toBe(touch.id);
    expect(await repos.signals.hasEffect(signal.id, older.id)).toBe(true);

    // a second booking for the same enrollment is kept but not counted
    const second = await reportClientEvent(deps, w.projectId, w.contact.id, { id: `cal-${recent.id}-2`, type: 'meeting_booked' });
    await processSignal(deps, second.signal.id);
    expect((await repos.signals.byId(second.signal.id))!.attribution).toBe('none');
    expect((await repos.enrollments.byId(recent.id))!.meetingBookedAt?.toISOString()).toBe(signal.occurredAt.toISOString());
  });

  it('an out-of-office pauses an active enrollment until the stated date and never exits it', async () => {
    const w = await seedWorld(deps, ['reply']);
    const now = deps.clock.now();
    const e = await seedEnrollment(deps, w);
    await seedTouch(deps, e, 'email', new Date(now.getTime() - HOUR));
    await seedWait(deps, e, { reply: 'end_replied' }, 'call_1');
    const until = new Date(now.getTime() + 3 * DAY);
    const { signal } = await deps.uow.transaction((scope) =>
      recordSignal(deps, scope, { projectId: w.projectId, contactId: w.contact.id, kind: 'ooo', channel: 'email', source: 'smtp', externalId: `ooo-${e.id}`, occurredAt: now, payload: { until: until.toISOString() } })
    );
    await processSignal(deps, signal.id);
    const after = (await repos.enrollments.byId(e.id))!;
    expect(after.status).toBe('paused');
    expect(after.pauseReason).toBe('ooo');
    expect(after.pausedUntil?.toISOString()).toBe(until.toISOString());
    expect(after.waiting).not.toBeNull();
    expect(after.repliedAt).toBeNull();
  });
});
