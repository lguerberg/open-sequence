import type { ChannelRef, EmailProvider } from '@opensequence/core';
import { describe, expect, it } from 'vitest';
import { ChannelRoutedEmailProvider } from './channel-router.js';

const adapter = (name: string, withPoll = true): EmailProvider => ({
  send: async (req) => ({ providerId: `${name}:${req.messageId}`, threadRef: name }),
  findSent: async () => null,
  ...(withPoll ? { poll: async () => ({ events: [], cursor: name }) } : {}),
  health: async () => (name === 'smtp' ? 'credentials_needed' : 'active'),
});

const channel = (config: Record<string, unknown>): ChannelRef => ({
  projectId: 'p',
  senderId: 's',
  channelId: 'c',
  connectionId: 'con',
  address: 'rep@example.com',
  config,
});

describe('ChannelRoutedEmailProvider', () => {
  const router = new ChannelRoutedEmailProvider(
    { google: adapter('google'), smtp: adapter('smtp', false) },
    'google'
  );

  it('sends through the adapter the channel names, and through the default when it names none', async () => {
    const req = { to: 'a@b.c', subject: 's', text: 't', messageId: '<m@x>', headers: {} };
    expect(await router.send({ ...req, channel: channel({ provider: 'smtp' }) })).toEqual({
      providerId: 'smtp:<m@x>',
      threadRef: 'smtp',
    });
    expect(await router.send({ ...req, channel: channel({ gmail_cursor: '12' }) })).toEqual({
      providerId: 'google:<m@x>',
      threadRef: 'google',
    });
  });

  it('health goes to the channel adapter; poll on an adapter without poll keeps the cursor', async () => {
    expect(await router.health(channel({ provider: 'smtp' }))).toBe('credentials_needed');
    expect(await router.health(channel({}))).toBe('active');
    expect(
      await router.poll({
        channel: channel({ provider: 'smtp' }),
        cursor: 'c1',
        threadRefs: [],
        messageIds: [],
      })
    ).toEqual({ events: [], cursor: 'c1' });
    expect(
      await router.poll({ channel: channel({}), cursor: null, threadRefs: [], messageIds: [] })
    ).toEqual({ events: [], cursor: 'google' });
  });

  it('refuses a channel that names an adapter it does not have', async () => {
    await expect(
      router.findSent({ channel: channel({ provider: 'outlook' }), messageId: '<m@x>' })
    ).rejects.toThrow(/PROVIDER_MISCONFIGURED/);
    expect(() => new ChannelRoutedEmailProvider({ smtp: adapter('smtp') }, 'google')).toThrow(
      /PROVIDER_MISCONFIGURED/
    );
  });
});
