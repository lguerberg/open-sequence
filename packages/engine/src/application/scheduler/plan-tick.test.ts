import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestDb, migrateTestDb } from '../../test/db.js';
import { makeTestDeps } from '../../test/engine-stubs.js';
import { enrollmentRow, seedSequence } from '../../test/seed.js';
import { planTick } from './plan-tick.js';
import { reapTick } from './reap-tick.js';
import { runJob } from './run-job.js';

describe('planTick', () => {
  beforeAll(migrateTestDb);
  afterAll(closeTestDb);

  it('claims two due enrollments of one sender under one token and advances both to the end', async () => {
    const deps = makeTestDeps();
    const repos = deps.uow.repos;
    const seed = await seedSequence(repos, { contacts: 2 });
    const [a, b] = await repos.enrollments.insertMany([enrollmentRow(seed, seed.contactIds[0]!), enrollmentRow(seed, seed.contactIds[1]!)]);

    // The claim itself: one token for the tick, both ids, both rows marked with it.
    const claim = await deps.uow.transaction(({ repos: r }) => r.enrollments.claimDue(new Date(), 50, 500));
    expect(claim.token).toMatch(/^plan_/);
    expect(claim.ids).toEqual(expect.arrayContaining([a!.id, b!.id]));
    expect((await repos.enrollments.byId(a!.id))!.ownerRunId).toBe(claim.token);
    expect((await repos.enrollments.byId(b!.id))!.ownerRunId).toBe(claim.token);
    // A second claim finds nothing: the rows are owned.
    expect((await deps.uow.transaction(({ repos: r }) => r.enrollments.claimDue(new Date(), 50, 500))).ids).not.toEqual(expect.arrayContaining([a!.id]));

    // Hand them back and let the tick do the whole thing.
    await repos.enrollments.update(a!.id, { ownerRunId: null });
    await repos.enrollments.update(b!.id, { ownerRunId: null });
    const summary = await planTick(deps);
    expect(summary.claimed).toBeGreaterThanOrEqual(2);
    expect(summary.advanced).toBe(summary.claimed);

    for (const id of [a!.id, b!.id]) {
      const e = (await repos.enrollments.byId(id))!;
      expect(e.status).toBe('completed');
      expect(e.ownerRunId).toBeNull();
      expect(e.nextRunAt).toBeNull();
      const runs = await repos.runs.byEnrollment(id);
      // Both ledger rows share the transaction's created_at, so their relative order is not fixed.
      expect(runs.map((r) => r.nodeId).sort()).toEqual(['end', 'start']);
    }
  });

  it('wakes an enrollment whose pause has ended and raises enrollment.resumed', async () => {
    const deps = makeTestDeps();
    const repos = deps.uow.repos;
    const seed = await seedSequence(repos);
    const [e] = await repos.enrollments.insertMany([enrollmentRow(seed, seed.contactIds[0]!, { status: 'paused', pauseReason: 'manual', pausedUntil: new Date(Date.now() - 60_000), nextRunAt: null })]);
    const secret = await deps.secrets.encrypt('whsec_x');
    const ep = await repos.webhooks.createEndpoint({ id: deps.ids.next('webhookEndpoint'), projectId: seed.projectId, url: 'https://93.184.216.34/h', secretEnc: secret.ciphertext, keyId: secret.keyId, eventTypes: ['enrollment.resumed'], status: 'active' });

    const summary = await planTick(deps);
    expect(summary.resumed).toBeGreaterThanOrEqual(1);
    // The resume sets the timer; this tick's claim ran before it, so the step runs on the next one.
    const after = (await repos.enrollments.byId(e!.id))!;
    expect(after.status).toBe('active');
    expect(after.pausedUntil).toBeNull();
    expect(after.pauseReason).toBeNull();
    expect(after.nextRunAt).not.toBeNull();
    const deliveries = await repos.webhooks.listDeliveries(ep.id, { limit: 10 });
    expect(deliveries.items.map((d) => d.eventType)).toEqual(['enrollment.resumed']);

    const next = await planTick(deps);
    expect(next.advanced).toBeGreaterThanOrEqual(1);
    expect((await repos.enrollments.byId(e!.id))!.status).toBe('completed');
  });

  it('the reaper hands back a claim an old planner never advanced', async () => {
    const deps = makeTestDeps();
    const repos = deps.uow.repos;
    const seed = await seedSequence(repos);
    const [e] = await repos.enrollments.insertMany([enrollmentRow(seed, seed.contactIds[0]!, { ownerRunId: 'plan_old_claim', nextRunAt: null })]);
    const { testDb } = await import('../../test/db.js');
    const { sql } = await import('drizzle-orm');
    await testDb().execute(sql`update seq.enrollments set updated_at = now() - interval '30 minutes' where id = ${e!.id}`);

    const summary = await reapTick(deps);
    expect(summary.releasedClaims).toBeGreaterThanOrEqual(1);
    const after = (await repos.enrollments.byId(e!.id))!;
    expect(after.ownerRunId).toBeNull();
    expect(after.nextRunAt).not.toBeNull();
  });

  it('runJob runs under the lease and skips while another holder has it', async () => {
    const deps = makeTestDeps();
    const scheduler = deps.uow.repos.scheduler;
    const ran: string[] = [];
    expect(await runJob(deps, 'retention', 60_000, async () => void ran.push('a'))).toBe('ran');
    expect(ran).toEqual(['a']);
    // Take the lease by hand: the next runJob must skip.
    expect(await scheduler.acquire('retention', 'someone-else', 60_000, new Date())).toBe(true);
    expect(await runJob(deps, 'retention', 60_000, async () => void ran.push('b'))).toBe('skipped');
    expect(ran).toEqual(['a']);
    await scheduler.markRan('retention', new Date());
    // A throwing job reports failed and still releases the lease.
    expect(
      await runJob(deps, 'retention', 60_000, async () => {
        throw new Error('boom');
      })
    ).toBe('failed');
    expect(await runJob(deps, 'retention', 60_000, async () => void ran.push('c'))).toBe('ran');
  });
});
