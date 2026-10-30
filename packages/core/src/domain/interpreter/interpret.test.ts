import { describe, expect, it } from 'vitest';
import { validateDefinition } from '../definition/validate.js';
import type { FactReader, FactValue } from '../conditions/facts.js';
import type { Definition, DefinitionInput } from '../definition/schema.js';
import { interpret } from './interpret.js';
import type { Effect, InterpretContext } from './effects.js';

const def = (jitter?: string): Definition => {
  const input: DefinitionInput = {
    schema_version: 1,
    entry: 'start',
    settings: { send_window: { days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '08:00', to: '18:00', tz: 'contact' }, reenroll: 'never', ...(jitter ? { jitter } : {}) },
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

interface CtxOptions {
  jitter?: string;
  random?: () => number;
  deferredUntil?: Date | null;
}

const ctxAt = (nodeId: string, now: Date, facts: Record<string, FactValue> = {}, opts: CtxOptions = {}): InterpretContext => {
  const reader: FactReader = { get: async (f) => facts[f] ?? null };
  return {
    definition: def(opts.jitter),
    state: { enrollmentId: 'enr_1', versionId: 'ver_1', contactId: 'ctc_1', senderId: 'snd_1', currentNodeId: nodeId, touchCount: 0, lastTouchAt: null, status: 'active', deferredUntil: opts.deferredUntil ?? null },
    facts: reader,
    now,
    timing: { contactTz: 'Europe/London', senderTz: 'America/New_York', random: opts.random ?? (() => 0) },
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
    expect(r.effects[0]).toEqual({ kind: 'goto', nodeId: 'email_1', at: new Date('2026-10-19T07:00:00.000Z'), deferred: true }); // Monday 08:00 BST
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

/** A random source that returns the given rolls in order and counts how often it was asked. */
const rolls = (...values: number[]) => {
  const fn = Object.assign(() => {
    fn.calls++;
    return values.shift() ?? 0.99;
  }, { calls: 0 });
  return fn;
};

describe('outreach jitter is rolled once per send time', () => {
  // The 2026-10-21 production bug: every wake-up of a self-deferred step rolled a new jitter, so
  // with jitter "20m" each wake-up had about a 5% chance to send and sends slid by hours.

  it('an outreach step entered at 10:00 with a 20m jitter defers once to 10:00 plus the roll, then sends when it fires', async () => {
    const random = rolls(0.6, 0.6, 0.6);
    const entered = new Date('2026-10-14T09:00:00Z'); // Wed 10:00 BST
    const first = await interpret(ctxAt('email_1', entered, {}, { jitter: '20m', random }));
    const at = new Date('2026-10-14T09:12:00.000Z'); // + 0.6 x 20m
    expect(first.effects).toEqual([{ kind: 'goto', nodeId: 'email_1', at, deferred: true }]);
    expect(random.calls).toBe(1);

    // The deferral fires at the time it chose: send, with no second roll and no second deferral.
    const woken = await interpret(ctxAt('email_1', at, {}, { jitter: '20m', random, deferredUntil: at }));
    expect(kinds(woken.effects)).toEqual(['enqueue']);
    expect(random.calls).toBe(1);

    // A planner tick a little late still sends.
    const late = await interpret(ctxAt('email_1', new Date(at.getTime() + 45_000), {}, { jitter: '20m', random, deferredUntil: at }));
    expect(kinds(late.effects)).toEqual(['enqueue']);
  });

  it('the window still defers correctly from outside it, then sends at the jittered opening', async () => {
    const random = rolls(0.5);
    const saturday = new Date('2026-10-17T10:00:00Z');
    const first = await interpret(ctxAt('email_1', saturday, {}, { jitter: '20m', random }));
    const at = new Date('2026-10-19T07:10:00.000Z'); // Monday 08:00 BST + 10m
    expect(first.effects).toEqual([{ kind: 'goto', nodeId: 'email_1', at, deferred: true }]);
    const woken = await interpret(ctxAt('email_1', at, {}, { jitter: '20m', random, deferredUntil: at }));
    expect(kinds(woken.effects)).toEqual(['enqueue']);
    expect(random.calls).toBe(1);
  });

  it('a roll that crosses the end of the window moves to the next opening, which sends', async () => {
    const random = rolls(0.5);
    const friday = new Date('2026-10-16T16:55:00Z'); // Fri 17:55 BST; +10m is past 18:00
    const first = await interpret(ctxAt('email_1', friday, {}, { jitter: '20m', random }));
    const at = new Date('2026-10-19T07:00:00.000Z'); // Monday 08:00 BST
    expect(first.effects).toEqual([{ kind: 'goto', nodeId: 'email_1', at, deferred: true }]);
    const woken = await interpret(ctxAt('email_1', at, {}, { jitter: '20m', random, deferredUntil: at }));
    expect(kinds(woken.effects)).toEqual(['enqueue']);
  });

  it('a re-entry after a pause still respects the window', async () => {
    // Deferred to Friday 10:12 BST, paused, resumed on Saturday: pushed into Monday's window with
    // one fresh roll (so resumed enrollments do not all send at 08:00), and that deferral sends.
    const random = rolls(0.25);
    const deferredUntil = new Date('2026-10-16T09:12:00Z');
    const resumed = await interpret(ctxAt('email_1', new Date('2026-10-17T10:00:00Z'), {}, { jitter: '20m', random, deferredUntil }));
    const at = new Date('2026-10-19T07:05:00.000Z'); // Monday 08:00 BST + 5m
    expect(resumed.effects).toEqual([{ kind: 'goto', nodeId: 'email_1', at, deferred: true }]);
    const woken = await interpret(ctxAt('email_1', at, {}, { jitter: '20m', random, deferredUntil: at }));
    expect(kinds(woken.effects)).toEqual(['enqueue']);
    expect(random.calls).toBe(1);
  });

  it('a re-entry after a pause that lands inside the window sends at once', async () => {
    const random = rolls(0.9);
    const r = await interpret(ctxAt('email_1', new Date('2026-10-15T12:00:00Z'), {}, { jitter: '20m', random, deferredUntil: new Date('2026-10-14T09:12:00Z') }));
    expect(kinds(r.effects)).toEqual(['enqueue']);
    expect(random.calls).toBe(0);
  });
});

describe('linkedin_connect', () => {
  const linkedinDef = (note?: string): Definition => {
    const r = validateDefinition({
      schema_version: 1,
      entry: 'start',
      settings: { reenroll: 'never' },
      exit_on: ['reply'],
      nodes: {
        start: { type: 'start', next: { then: 'li' } },
        li: { type: 'linkedin_connect', params: note === undefined ? {} : { note }, next: { completed: 'end', no_answer: 'end', skipped: 'email_1' } },
        email_1: { type: 'outreach', channel: 'email', action: 'send', params: { subject: 'Hi', body: 'x {{ unsubscribe_url }}' }, next: { sent: 'end' } },
        end: { type: 'end' },
      },
    });
    if (!r.ok || !r.definition) throw new Error(JSON.stringify(r.problems));
    return r.definition;
  };
  const at = new Date('2026-10-16T14:00:00Z');
  const ctx = (definition: Definition, contact: Record<string, unknown>): InterpretContext => ({
    ...ctxAt('li', at),
    definition,
    template: { contact, sender: { name: 'Max' }, sequence: { name: 'UK intro' } },
  });

  it('creates a task with the profile and the rendered note, completed by opening it', async () => {
    const r = await interpret(ctx(linkedinDef('Hi {{ contact.first_name | "there" }}, saw your post.'), { first_name: 'Dana', linkedin_url: 'https://www.linkedin.com/in/dana' }));
    const eff = r.effects[0] as Extract<Effect, { kind: 'create_task' }>;
    expect(eff.kind).toBe('create_task');
    expect(eff.task).toMatchObject({ kind: 'linkedin_connect', title: 'Connect with Dana on LinkedIn', body: 'Hi Dana, saw your post.', link: 'https://www.linkedin.com/in/dana', completeOnOpen: 'sent', dialer: false, onCompleted: 'end', onExpired: 'end' });
    expect(eff.task.dueAt).toEqual(at); // due as soon as the step runs
    expect(eff.task.expiresAt.toISOString()).toBe('2026-10-23T14:00:00.000Z');
  });

  it('skips a contact without a LinkedIn URL down the skipped branch', async () => {
    const r = await interpret(ctx(linkedinDef(), { first_name: 'Dana' }));
    expect(r.effects[0]).toMatchObject({ kind: 'record', status: 'skipped', branch: 'skipped', run: { result: { reason: 'no_linkedin_url' } } });
    expect(r.effects[1]).toEqual({ kind: 'goto', nodeId: 'email_1' });
  });

  it('cuts a rendered note over 300 characters at a word', async () => {
    const r = await interpret(ctx(linkedinDef('{{ contact.first_name | "there" }} ' + 'word '.repeat(70)), { first_name: 'Dana', linkedin_url: 'https://www.linkedin.com/in/dana' }));
    const body = (r.effects[0] as Extract<Effect, { kind: 'create_task' }>).task.body ?? '';
    expect(body.length).toBeLessThanOrEqual(300);
    expect(body.endsWith('word…')).toBe(true);
  });

  it('warns about notes free accounts cannot send', () => {
    const r = validateDefinition({
      schema_version: 1,
      entry: 'start',
      nodes: { start: { type: 'start', next: { then: 'li' } }, li: { type: 'linkedin_connect', params: { note: 'x'.repeat(250) } } },
    });
    expect(r.problems).toContainEqual(expect.objectContaining({ path: 'nodes.li.params.note', code: 'TOO_LONG', severity: 'warning' }));
  });
});
