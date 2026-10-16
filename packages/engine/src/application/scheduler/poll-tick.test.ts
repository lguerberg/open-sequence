/** The poll job picks the mail adapter per channel: an SMTP channel keeps its own cursor, records its provider and has no calendar. */
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

  it('an SMTP channel: imap_cursor, events recorded as smtp, no calendar call, health checked', async () => {
    const polled: Array<{ cursor: string | null; config: Record<string, unknown> }> = [];
    const health: ChannelRef[] = [];
    let calendarCalls = 0;
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
        calendar: {
          poll: async () => {
            calendarCalls++;
            return { events: [], cursor: 'cal' };
          },
        },
      },
    });
    const seed = await seedSequence(deps.uow.repos);
    const channel = await setChannel(deps, seed.projectId, seed.senderId, {
      channel: 'email',
      address: 'ann@example.com',
      connectionId: 'con_smtp',
      config: { provider: 'smtp', imap_cursor: '7:40', gmail_cursor: '999' },
    });

    expect(await pollChannel(deps, channel, new Date())).toBe(1);
    expect(polled).toEqual([
      { cursor: '7:40', config: expect.objectContaining({ provider: 'smtp' }) },
    ]);
    expect(calendarCalls).toBe(0);
    expect(health).toHaveLength(1);

    const after = (await deps.uow.repos.senders.channel(seed.senderId, 'email'))!;
    expect(after.config).toMatchObject({
      provider: 'smtp',
      imap_cursor: '7:42',
      gmail_cursor: '999',
    });
    expect(after.config['calendar_cursor']).toBeUndefined();
    const signals = await deps.uow.repos.signals.byContact(seed.contactIds[0]!, 10);
    expect(signals.map((s) => [s.kind, s.source])).toEqual([['bounce', 'smtp']]);
  });

  it('a channel that names no provider is Gmail: gmail_cursor and the calendar', async () => {
    let calendarCalls = 0;
    const deps = makeTestDeps({
      providers: {
        email: {
          send: async () => ({ providerId: 'x', threadRef: 'x' }),
          findSent: async () => null,
          poll: async (req) => ({ events: [], cursor: `${req.cursor}+1` }),
          health: async () => 'active',
        },
        calendar: {
          poll: async () => {
            calendarCalls++;
            return { events: [], cursor: 'cal-1' };
          },
        },
      },
    });
    const seed = await seedSequence(deps.uow.repos);
    const channel = await setChannel(deps, seed.projectId, seed.senderId, {
      channel: 'email',
      address: 'ann@example.com',
      connectionId: 'con_google',
      config: { gmail_cursor: '100' },
    });
    await pollChannel(deps, channel, new Date());
    expect(calendarCalls).toBe(1);
    expect((await deps.uow.repos.senders.channel(seed.senderId, 'email'))!.config).toMatchObject({
      gmail_cursor: '100+1',
      calendar_cursor: 'cal-1',
    });
  });
});
