import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../domain/shared/clock.js';
import { closeTestDb, migrateTestDb } from '../../test/db.js';
import { makeTestDeps } from '../../test/engine-stubs.js';
import { enrollmentRow, seedSequence } from '../../test/seed.js';
import { advanceEnrollment } from './advance-enrollment.js';
import { pauseEnrollment } from './pause-enrollment.js';
import { resumeEnrollment } from './resume-enrollment.js';

/** start -> one email -> end, weekdays 08:00-18:00 in the sender's zone (UTC), jitter 20m. */
const definition = {
  schema_version: 1,
  entry: 'start',
  settings: { send_window: { days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '08:00', to: '18:00', tz: 'sender' }, jitter: '20m', reenroll: 'never' },
  exit_on: ['reply'],
  nodes: {
    start: { type: 'start', next: { then: 'email_1' } },
    email_1: { type: 'outreach', channel: 'email', action: 'send', params: { subject: 'Hi', body: 'Hello {{ unsubscribe_url }}' }, next: { sent: 'end' } },
    end: { type: 'end' },
  },
};

const clockAt = (iso: string): Clock & { set(iso: string): void } => {
  let now = new Date(iso);
  return { now: () => now, set: (s) => (now = new Date(s)) };
};

describe('advance: outreach jitter is rolled once', () => {
  beforeAll(migrateTestDb);
  afterAll(closeTestDb);
  afterEach(() => vi.restoreAllMocks());

  it('defers once to entry plus the roll, persists the deferral, then enqueues when it fires', async () => {
    const clock = clockAt('2026-10-14T10:00:00Z'); // Wednesday
    const deps = makeTestDeps({ clock });
    const repos = deps.uow.repos;
    const seed = await seedSequence(repos, { definition });
    const [row] = await repos.enrollments.insertMany([enrollmentRow(seed, seed.contactIds[0]!, { nextRunAt: clock.now() })]);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.6);

    await advanceEnrollment(deps, row!.id);
    let e = (await repos.enrollments.byId(row!.id))!;
    expect(e.currentNodeId).toBe('email_1');
    expect(e.nextRunAt?.toISOString()).toBe('2026-10-14T10:12:00.000Z');
    expect(e.deferral).toEqual({ nodeId: 'email_1', until: '2026-10-14T10:12:00.000Z' });
    expect(deps.queue.on('seq_email')).toHaveLength(0);
    expect(random).toHaveBeenCalledTimes(1);

    // The deferral fires: a different roll would push it again, but none is taken.
    random.mockReturnValue(0.9);
    clock.set('2026-10-14T10:12:00Z');
    await advanceEnrollment(deps, row!.id);
    e = (await repos.enrollments.byId(row!.id))!;
    expect(e.ownerRunId).not.toBeNull();
    expect(e.nextRunAt).toBeNull();
    expect(e.deferral).toBeNull();
    expect(deps.queue.on('seq_email')).toHaveLength(1);
    expect(random).toHaveBeenCalledTimes(1);
    const runs = await repos.runs.byEnrollment(row!.id);
    expect(runs.find((r) => r.nodeId === 'email_1')?.status).toBe('running');
  });

  it('a step deferred, paused and resumed outside the window is pushed into it once, then sends', async () => {
    const clock = clockAt('2026-10-16T17:50:00Z'); // Friday, ten minutes before the window closes
    const deps = makeTestDeps({ clock });
    const repos = deps.uow.repos;
    const seed = await seedSequence(repos, { definition });
    const [row] = await repos.enrollments.insertMany([enrollmentRow(seed, seed.contactIds[0]!, { nextRunAt: clock.now() })]);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.25);

    await advanceEnrollment(deps, row!.id);
    expect((await repos.enrollments.byId(row!.id))!.deferral).toEqual({ nodeId: 'email_1', until: '2026-10-16T17:55:00.000Z' });

    clock.set('2026-10-16T17:52:00Z');
    await pauseEnrollment(deps, seed.projectId, row!.id);
    clock.set('2026-10-17T10:00:00Z'); // Saturday
    await resumeEnrollment(deps, seed.projectId, row!.id);
    await advanceEnrollment(deps, row!.id);
    let e = (await repos.enrollments.byId(row!.id))!;
    expect(e.nextRunAt?.toISOString()).toBe('2026-10-19T08:05:00.000Z'); // Monday 08:00 + one fresh 5m roll
    expect(e.deferral).toEqual({ nodeId: 'email_1', until: '2026-10-19T08:05:00.000Z' });
    expect(deps.queue.on('seq_email')).toHaveLength(0);

    clock.set('2026-10-19T08:05:00Z');
    await advanceEnrollment(deps, row!.id);
    e = (await repos.enrollments.byId(row!.id))!;
    expect(e.deferral).toBeNull();
    expect(deps.queue.on('seq_email')).toHaveLength(1);
    expect(random).toHaveBeenCalledTimes(2);
  });
});
