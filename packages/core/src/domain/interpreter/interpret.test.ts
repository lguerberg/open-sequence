import { describe, expect, it } from 'vitest';
import { validateDefinition } from '../definition/validate.js';
import type { FactReader, FactValue } from '../conditions/facts.js';
import type { Definition, DefinitionInput } from '../definition/schema.js';
import { interpret } from './interpret.js';
import type { Effect, InterpretContext } from './effects.js';

const def = (): Definition => {
  const input: DefinitionInput = {
    schema_version: 1,
    entry: 'start',
    settings: { send_window: { days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '08:00', to: '18:00', tz: 'contact' }, reenroll: 'never' },
    exit_on: ['reply'],
    nodes: {
      start: { type: 'start', next: { then: 'email_1' } },
      email_1: { type: 'outreach', channel: 'email', action: 'send', params: { subject: 'Hi {{ contact.first_name | "there" }}', body: 'x {{ unsubscribe_url }}' }, next: { sent: 'wait_1', failed: 'end' } },
      wait_1: { type: 'wait', params: { duration: '2bd' }, next: { then: 'cond' } },
      cond: { type: 'condition', params: { mode: 'all', rules: [{ field: 'attrs.deal.stage', op: 'is', value: 'contacting' }] }, next: { yes: 'call', no: 'wait_reply' } },
      wait_reply: { type: 'wait_for', params: { events: ['reply:sms', 'meeting_booked'], timeout: '3d' }, next: { 'reply:sms': 'end', meeting_booked: 'end', timeout: 'call' } },
      call: { type: 'task', params: { kind: 'call', title: 'Call {{ contact.first_name | "them" }}', body: 'About {{ sequence.name }}', due: '1bd', dialer: true }, next: { completed: 'end', no_answer: 'end' }, branches_by_outcome: { connected: 'end' } },
      end: { type: 'end' },
    },
  };
  const r = validateDefinition(input);
  if (!r.ok || !r.definition) throw new Error(JSON.stringify(r.problems));
  return r.definition;
};

const ctxAt = (nodeId: string, now: Date, facts: Record<string, FactValue> = {}): InterpretContext => {
  const reader: FactReader = { get: async (f) => facts[f] ?? null };
  return {
    definition: def(),
    state: { enrollmentId: 'enr_1', versionId: 'ver_1', contactId: 'ctc_1', senderId: 'snd_1', currentNodeId: nodeId, touchCount: 0, lastTouchAt: null, status: 'active' },
    facts: reader,
    now,
    timing: { contactTz: 'Europe/London', senderTz: 'America/New_York', random: () => 0 },
    template: { contact: { first_name: 'Dana' }, sender: { name: 'Max' }, sequence: { name: 'UK intro' }, unsubscribe_url: 'https://x/u/t' },
    factLog: [],
  };
};

const kinds = (effects: Effect[]) => effects.map((e) => e.kind);

describe('interpret', () => {
  it('start records and moves on', async () => {
    const r = await interpret(ctxAt('start', new Date('2026-10-14T10:00:00Z')));
    expect(kinds(r.effects)).toEqual(['record', 'goto']);
    expect(r.effects[1]).toEqual({ kind: 'goto', nodeId: 'email_1' });
  });

  it('an outreach step inside the window is enqueued as a touch with its transitions', async () => {
    const r = await interpret(ctxAt('email_1', new Date('2026-10-14T10:00:00Z'))); // Wed 11:00 London
    expect(r.effects).toHaveLength(1);
    expect(r.effects[0]).toMatchObject({ kind: 'enqueue', queue: 'seq_email', run: { nodeId: 'email_1', channel: 'email', action: 'send', touch: true, next: { sent: 'wait_1', failed: 'end' } } });
  });

  it('an outreach step outside the window comes back when it opens', async () => {
    const r = await interpret(ctxAt('email_1', new Date('2026-10-17T10:00:00Z'))); // Saturday
    expect(r.effects[0]).toEqual({ kind: 'goto', nodeId: 'email_1', at: new Date('2026-10-19T07:00:00.000Z') }); // Monday 08:00 BST
  });

  it('a wait is a goto with a time, in the contact zone, through the weekend', async () => {
    const r = await interpret(ctxAt('wait_1', new Date('2026-10-16T14:00:00Z'))); // Friday
    expect(r.effects[1]).toEqual({ kind: 'goto', nodeId: 'cond', at: new Date('2026-10-20T14:00:00.000Z') });
  });

  it('a condition records the facts it read and takes a branch', async () => {
    const r = await interpret(ctxAt('cond', new Date('2026-10-14T10:00:00Z'), { 'attrs.deal.stage': 'lost' }));
    expect(r.facts).toHaveLength(1);
    expect(r.facts[0]).toMatchObject({ field: 'attrs.deal.stage', value: 'lost', matched: false });
    expect(r.effects[1]).toEqual({ kind: 'goto', nodeId: 'wait_reply' });
    expect((r.effects[0] as Extract<Effect, { kind: 'record' }>).branch).toBe('no');
  });

  it('wait_for lists its events with targets and a timeout', async () => {
    const r = await interpret(ctxAt('wait_reply', new Date('2026-10-14T10:00:00Z')));
    expect(r.effects[0]).toMatchObject({ kind: 'wait', events: { 'reply:sms': 'end', meeting_booked: 'end' }, onTimeout: 'call', until: new Date('2026-10-17T10:00:00.000Z') });
  });

  it('a task renders its templates, follows the sender calendar and carries its branches', async () => {
    const r = await interpret(ctxAt('call', new Date('2026-10-16T14:00:00Z'))); // Friday
    const eff = r.effects[0] as Extract<Effect, { kind: 'create_task' }>;
    expect(eff.kind).toBe('create_task');
    expect(eff.task).toMatchObject({ kind: 'call', title: 'Call Dana', body: 'About UK intro', dialer: true, autoComplete: true, connectedOutcomes: ['connected'], branchesByOutcome: { connected: 'end' }, onCompleted: 'end', onExpired: 'end' });
    expect(eff.task.dueAt.toISOString()).toBe('2026-10-19T14:00:00.000Z'); // Monday, business days
    expect(eff.task.expiresAt.toISOString()).toBe('2026-10-26T14:00:00.000Z'); // due + 7 calendar days
  });

  it('end completes', async () => {
    const r = await interpret(ctxAt('end', new Date()));
    expect(kinds(r.effects)).toEqual(['record', 'complete']);
  });
});
