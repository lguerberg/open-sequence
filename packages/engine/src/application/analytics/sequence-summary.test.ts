import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../../infrastructure/ids.js';
import { closeTestDb, migrateTestDb } from '../../test/db.js';
import { makeTestDeps } from '../../test/engine-stubs.js';
import { enrollmentRow, seedSequence } from '../../test/seed.js';
import { allSequences } from './all-sequences.js';
import { sequenceChannels } from './sequence-channels.js';
import { sequenceExits } from './sequence-exits.js';
import { sequenceNodes } from './sequence-nodes.js';
import { sequenceSummary } from './sequence-summary.js';

describe('analytics read model', () => {
  beforeAll(migrateTestDb);
  afterAll(closeTestDb);

  it('counts enrollments, touches and attributed signals the way section 11 defines them', async () => {
    const deps = makeTestDeps();
    const repos = deps.uow.repos;
    const seed = await seedSequence(repos, { contacts: 3 });
    const sentAt = new Date(Date.now() - 3_600_000);
    const [replied, exitedBounce, active] = await repos.enrollments.insertMany([
      enrollmentRow(seed, seed.contactIds[0]!, { status: 'exited', exitReason: 'reply', repliedAt: new Date(), repliedChannel: 'email', touchCount: 1, lastTouchAt: sentAt, finishedAt: new Date() }),
      enrollmentRow(seed, seed.contactIds[1]!, { status: 'exited', exitReason: 'bounce', touchCount: 1, lastTouchAt: sentAt, finishedAt: new Date() }),
      enrollmentRow(seed, seed.contactIds[2]!, { status: 'active', currentNodeId: 'wait' }),
    ]);
    const run = (enrollmentId: string, patch: Record<string, unknown>) => ({
      id: newId('run'),
      projectId: seed.projectId,
      enrollmentId,
      sequenceId: seed.sequenceId,
      versionId: seed.versionId,
      nodeId: 'email_1',
      nodeType: 'outreach',
      channel: 'email',
      action: 'send',
      touchNumber: 1,
      attempt: 1,
      status: 'done' as const,
      idempotencyKey: `k:${newId('run')}`,
      next: {},
      startedAt: sentAt,
      finishedAt: sentAt,
      provider: 'google',
      providerRef: null,
      threadRef: null,
      branch: 'sent',
      result: { outcome: { delivered_at: sentAt.toISOString() } },
      error: null,
      senderId: seed.senderId,
      enqueuedAt: null,
      ...patch,
    });
    const r1 = await repos.runs.insert(run(replied!.id, {}));
    await repos.runs.insert(run(exitedBounce!.id, { result: { outcome: { delivered_at: null, bounced: true } } }));
    await repos.runs.insert(run(active!.id, { status: 'skipped', branch: 'skipped', touchNumber: null, result: { skip_reason: 'no_email' } }));
    const { signal } = await repos.signals.insertIfNew({ id: newId('signal'), projectId: seed.projectId, contactId: seed.contactIds[0]!, kind: 'reply', channel: 'email', source: 'google', externalId: newId('signal'), occurredAt: new Date(sentAt.getTime() + 600_000), payload: {} });
    await repos.signals.attribute(signal.id, r1.id, 'direct');

    const summary = await sequenceSummary(deps, seed.projectId, seed.sequenceId);
    expect(summary).toMatchObject({ enrolled: 3, active: 1, exited: 2, completed: 0, touches_delivered: 1, replies: 1, meetings: 0, reply_rate_per_100_enrolled: 33.3, reply_rate_per_100_delivered: 100, replies_by_channel: { email: 1 } });

    const exits = await sequenceExits(deps, seed.projectId, seed.sequenceId);
    expect(exits.exits).toEqual([
      { reason: 'bounce', count: 1 },
      { reason: 'reply', count: 1 },
    ]);

    const nodes = await sequenceNodes(deps, seed.projectId, seed.sequenceId);
    expect(nodes.nodes).toHaveLength(1);
    expect(nodes.nodes[0]).toMatchObject({ node_id: 'email_1', reached: 3, executed: 2, skipped: 1, skipped_by_reason: { no_email: 1 }, failed: 0, delivered: 1, bounced: 1, replies: 1, meetings: 0, median_time_to_reply_seconds: 600 });

    const channels = await sequenceChannels(deps, seed.projectId, seed.sequenceId);
    expect(channels.channels).toEqual([
      expect.objectContaining({ channel: 'email', touch_number: 0, reached: 1, sent: 0, skipped: 1 }),
      expect.objectContaining({ channel: 'email', touch_number: 1, reached: 2, sent: 2, delivered: 1, bounced: 1, replies: 1, reply_rate_per_100_sent: 50 }),
    ]);

    const all = await allSequences(deps, seed.projectId);
    expect(all.sequences).toEqual([expect.objectContaining({ sequence: seed.sequenceId, enrolled: 3, replies: 1, meetings: 0, replies_per_100_enrolled: 33.3 })]);
    expect((await allSequences(deps, seed.projectId, { minEnrolled: 10 })).sequences).toEqual([]);

    // Filters: a country nobody has, a sender filter that matches, a window before everything.
    expect((await sequenceSummary(deps, seed.projectId, seed.sequenceId, { country: 'fr' })).enrolled).toBe(0);
    expect((await sequenceSummary(deps, seed.projectId, seed.sequenceId, { sender: seed.senderId })).enrolled).toBe(3);
    expect((await sequenceSummary(deps, seed.projectId, seed.sequenceId, { to: new Date(Date.now() - 86_400_000) })).enrolled).toBe(0);
    await expect(sequenceSummary(deps, seed.projectId, 'seq_nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
