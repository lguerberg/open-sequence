/** The poll job reads each mailbox from its IMAP cursor, records the events as smtp and checks health. */
import { ensureBuiltins, type ChannelRef } from '@opensequence/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestDb, migrateTestDb } from '../../test/db.js';
import { makeTestDeps } from '../../test/engine-stubs.js';
import { seedSequence } from '../../test/seed.js';
import { setChannel } from '../senders/set-channel.js';
import { pollChannel } from './poll-tick.js';

describe('pollChannel', () => {
  beforeAll(async () => {
    ensureBuiltins();
    await migrateTestDb();
  });
  afterAll(closeTestDb);

  it('reads from imap_cursor, records events as smtp, checks health', async () => {
    const polled: Array<{ cursor: string | null; config: Record<string, unknown> }> = [];
    const health: ChannelRef[] = [];
    const deps = makeTestDeps({
      providers: {
        email: {
          send: async () => ({ providerId: 'x', threadRef: 'x' }),
          findSent: async () => null,
          poll: async (req) => {
            polled.push({ cursor: req.cursor, config: req.channel.config });
            return {
              events: [
                {
                  kind: 'bounce',
                  channel: 'email',
                  externalId: `dsn-${req.channel.channelId}@mx.example`,
                  occurredAt: new Date(),
                  address: 'bo0@example.com',
                  hard: true,
                },
              ],
              cursor: '7:42',
            };
          },
          health: async (channel) => {
            health.push(channel);
            return 'active';
          },
        },
      },
    });
    const seed = await seedSequence(deps.uow.repos);
    const channel = await setChannel(deps, seed.projectId, seed.senderId, {
      channel: 'email',
      address: 'ann@example.com',
      connectionId: 'con_smtp',
      config: { provider: 'smtp', imap_cursor: '7:40' },
    });

    expect(await pollChannel(deps, channel, new Date())).toBe(1);
    expect(polled).toEqual([
      { cursor: '7:40', config: expect.objectContaining({ provider: 'smtp' }) },
    ]);
    expect(health).toHaveLength(1);

    const after = (await deps.uow.repos.senders.channel(seed.senderId, 'email'))!;
    expect(after.config).toMatchObject({
      provider: 'smtp',
      imap_cursor: '7:42',
    });
    const signals = await deps.uow.repos.signals.byContact(seed.contactIds[0]!, 10);
    expect(signals.map((s) => [s.kind, s.source])).toEqual([['bounce', 'smtp']]);
  });

  it('asks for reply bodies and stores them only when the project keeps them', async () => {
    const asked: Array<boolean | undefined> = [];
    let n = 0;
    const deps = makeTestDeps({
      providers: {
        email: {
          send: async () => ({ providerId: 'x', threadRef: 'x' }),
          findSent: async () => null,
          poll: async (req) => {
            asked.push(req.includeBodies);
            n++;
            return {
              events: [
                {
                  kind: 'reply',
                  channel: 'email',
                  externalId: `reply-${n}-${req.channel.channelId}@acme.com`,
                  occurredAt: new Date(),
                  from: 'bo0@example.com',
                  to: 'ann@example.com',
                  subject: 'Re: Hello',
                  body: 'Thursday works.',
                },
              ],
              cursor: `7:${40 + n}`,
            };
          },
          health: async () => 'active',
        },
      },
    });
    const seed = await seedSequence(deps.uow.repos);
    await deps.uow.repos.projects.updateSettings(seed.projectId, { match_replies_outside_thread: true });
    const channel = await setChannel(deps, seed.projectId, seed.senderId, {
      channel: 'email',
      address: 'ann@example.com',
      connectionId: 'con_smtp',
      config: { provider: 'smtp', imap_cursor: '7:40' },
    });

    await pollChannel(deps, channel, new Date());
    await deps.uow.repos.projects.updateSettings(seed.projectId, { match_replies_outside_thread: true, store_inbound_bodies: true });
    await pollChannel(deps, channel, new Date());

    expect(asked).toEqual([false, true]);
    const inbound = (await deps.uow.repos.messages.byContact(seed.contactIds[0]!, 10)).filter((m) => m.direction === 'in');
    expect(inbound.map((m) => [m.providerId, m.body]).sort()).toEqual([
      [`reply-1-${channel.id}@acme.com`, null],
      [`reply-2-${channel.id}@acme.com`, 'Thursday works.'],
    ]);
  });
});
