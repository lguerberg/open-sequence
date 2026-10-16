/** Senders: who the outreach is sent as, and which steps each one can run. */
import type { Readiness } from '@opensequence/sdk';
import { bullets, compact, count, defineTool, lines, nextPage, paging, ref } from '../tool.js';

const CHANNELS = ['email', 'sms'] as const;

export const listSenders = defineTool({
  name: 'list_senders',
  title: 'List senders',
  description:
    'Lists the senders (the people outreach is sent as) with their external id, email, time zone and status. Use it to find the sender a person means by name ("with Max") before enrolling.',
  scope: 'read',
  input: { ...paging },
  async run(client, args) {
    const page = await client.senders.list(compact({ limit: args.limit, cursor: args.cursor }));
    const rows = page.items.map(
      (s) =>
        `${s.name} (external id ${s.externalId}, ${s.id}): ${s.email ?? 'no email'}, ${s.timezone}, ${s.status}`
    );
    return {
      summary: lines(
        `${count(page.items.length, 'sender')}.`,
        bullets(rows, 25),
        nextPage(page.nextCursor)
      ),
      data: { items: page.items, next_cursor: page.nextCursor },
    };
  },
});

export const getSenderReadiness = defineTool({
  name: 'get_sender_readiness',
  title: 'Check sender readiness',
  description:
    'Says which kinds of steps a sender can run right now (email, sms, task) and, for each one they cannot, why (google_not_connected, no_allo_number, …). Check it before enrolling contacts with a sender.',
  scope: 'read',
  input: { sender: ref('sender', 'snd_01J9…', 'u_42') },
  async run(client, args) {
    const readiness: Readiness = await client.senders.readiness(args.sender);
    const can = CHANNELS.filter((c) => readiness[c]?.ok);
    const cannot = CHANNELS.filter((c) => !readiness[c]?.ok).map(
      (c) => `${c} (${readiness[c]?.reason ?? 'not ready'})`
    );
    const summary = lines(
      `Sender ${args.sender} can run: ${[...can, 'task'].join(', ')}.`,
      cannot.length
        ? `Cannot run: ${cannot.join(', ')}. Those steps are skipped for this sender's contacts.`
        : 'Every channel is ready.'
    );
    return { summary, data: readiness };
  },
});
