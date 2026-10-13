/**
 * The built-in node types, channels and fact sources. They register through the same registries a
 * module would use, so nothing here is special-cased by the engine.
 */
import { z } from 'zod';
import { conditionParamsSchema, evaluate, OPERATORS_BY_TYPE, operatorNeedsValue } from '../conditions/evaluate.js';
import type { Effect, InterpretContext, RunDraft } from '../interpreter/effects.js';
import { render } from '../template/render.js';
import { addDuration, computeNextAt } from '../time/timing.js';
import { durationSchema, DEFINITION_LIMITS } from './schema.js';
import { registry, type RegisteredNode, type ValidationProblem } from './registry.js';

const WAIT_FOR_EVENTS = [
  'reply',
  'reply:email',
  'reply:sms',
  'reply:linkedin',
  'connection_accepted',
  'call_connected',
  'meeting_booked',
] as const;

function draft(node: RegisteredNode, touch: boolean, result: Record<string, unknown> = {}): RunDraft {
  const d: RunDraft = { nodeId: node.id, nodeType: node.type, touch, next: node.next, result };
  if (node.channel !== undefined) d.channel = node.channel;
  if (node.action !== undefined) d.action = node.action;
  return d;
}

function zoneFor(ctx: InterpretContext): string {
  const tzChoice = ctx.definition.settings.send_window?.tz ?? 'contact';
  return (tzChoice === 'contact' && ctx.timing.contactTz) || ctx.timing.senderTz;
}

function gotoOrComplete(node: RegisteredNode, key: string, at?: Date): Effect {
  const target = node.next[key];
  if (!target) return { kind: 'complete' };
  return at ? { kind: 'goto', nodeId: target, at } : { kind: 'goto', nodeId: target };
}

export function registerBuiltins(): void {
  // ---------------------------------------------------------------- nodes
  registry.registerNode({
    type: 'start',
    label: 'Start',
    params: z.object({}).strict(),
    transitions: { keys: ['then'], required: ['then'] },
    interpret: async (node) => [{ kind: 'record', run: draft(node, false), status: 'done', branch: 'then' }, gotoOrComplete(node, 'then')],
  });

  registry.registerNode({
    type: 'end',
    label: 'End',
    params: z.object({ label: z.string().max(80).optional() }).strict(),
    transitions: { keys: [], required: [] },
    terminal: true,
    interpret: async (node) => [{ kind: 'record', run: draft(node, false), status: 'done' }, { kind: 'complete' }],
  });

  registry.registerNode({
    type: 'wait',
    label: 'Wait',
    params: z.object({ duration: durationSchema }).strict(),
    transitions: { keys: ['then'], required: ['then'] },
    interpret: async (node, ctx) => {
      const until = addDuration(ctx.now, node.params['duration'] as string, zoneFor(ctx));
      return [{ kind: 'record', run: draft(node, false, { until: until.toISOString() }), status: 'done', branch: 'then' }, gotoOrComplete(node, 'then', until)];
    },
  });

  registry.registerNode({
    type: 'wait_for',
    label: 'Wait for an event',
    params: z
      .object({
        events: z.array(z.enum(WAIT_FOR_EVENTS)).min(1),
        timeout: durationSchema.optional(),
      })
      .strict(),
    transitions: { keys: [...WAIT_FOR_EVENTS, 'timeout'], required: [] },
    validate: (node) => {
      const events = (node.params['events'] as string[] | undefined) ?? [];
      return events
        .filter((e) => !node.next[e])
        .map((e) => ({ path: `nodes.${node.id}.next.${e}`, code: 'BAD_EVENT', message: `The event "${e}" is waited for but has no next step.`, severity: 'error' as const }));
    },
    interpret: async (node, ctx) => {
      const events: Record<string, string> = {};
      for (const e of node.params['events'] as string[]) {
        const target = node.next[e];
        if (target) events[e] = target;
      }
      const timeout = node.params['timeout'] as string | undefined;
      const until = timeout ? addDuration(ctx.now, timeout, zoneFor(ctx)) : null;
      const eff: Extract<Effect, { kind: 'wait' }> = { kind: 'wait', until, events, run: draft(node, false, { until: until?.toISOString() ?? null, events: Object.keys(events) }) };
      if (node.next['timeout']) eff.onTimeout = node.next['timeout'];
      return [eff];
    },
  });

  registry.registerNode({
    type: 'condition',
    label: 'Condition',
    params: conditionParamsSchema,
    transitions: { keys: ['yes', 'no'], required: ['yes', 'no'] },
    validate: (node, vctx) => {
      const problems: ValidationProblem[] = [];
      const parsed = conditionParamsSchema.safeParse(node.params);
      if (!parsed.success) return problems; // the schema check already reported it
      parsed.data.rules.forEach((rule, i) => {
        const spec = vctx.factFields(rule.field);
        const path = `nodes.${node.id}.params.rules.${i}`;
        if (!spec) {
          problems.push({ path: `${path}.field`, code: 'UNKNOWN_FIELD', message: `"${rule.field}" is not a field conditions can read.`, severity: 'error' });
          return;
        }
        const ops = OPERATORS_BY_TYPE[spec.type];
        if (!ops.includes(rule.op)) {
          problems.push({ path: `${path}.op`, code: 'BAD_OPERATOR', message: `"${rule.op}" cannot be used on ${spec.label} (${spec.type}). Use one of: ${ops.join(', ')}.`, severity: 'error' });
        }
        if (operatorNeedsValue(rule.op) && (rule.value === undefined || rule.value === '')) {
          problems.push({ path: `${path}.value`, code: 'BAD_VALUE', message: `"${rule.op}" needs a value.`, severity: 'error' });
        }
        if (spec.type === 'number' && operatorNeedsValue(rule.op) && Number.isNaN(Number(rule.value))) {
          problems.push({ path: `${path}.value`, code: 'BAD_VALUE', message: `${spec.label} is a number; "${String(rule.value)}" is not.`, severity: 'error' });
        }
        if (spec.type === 'enum' && spec.values && operatorNeedsValue(rule.op) && !spec.values.includes(String(rule.value))) {
          problems.push({ path: `${path}.value`, code: 'BAD_VALUE', message: `${spec.label} is one of ${spec.values.join(', ')}; "${String(rule.value)}" is not.`, severity: 'error' });
        }
      });
      return problems;
    },
    interpret: async (node, ctx) => {
      const params = conditionParamsSchema.parse(node.params);
      const { matched, facts } = await evaluate(params, ctx.facts, (f) => registry.factField(f));
      ctx.factLog.push(...facts);
      const branch = matched ? 'yes' : 'no';
      const note = matched ? 'The condition matched.' : `${facts.filter((f) => f.matched).length} of ${params.rules.length} rules matched, so the contact took No.`;
      return [{ kind: 'record', run: draft(node, false, { facts, mode: params.mode, branch, note }), status: 'done', branch }, gotoOrComplete(node, branch)];
    },
  });

  const taskParams = z
    .object({
      kind: z.string().min(1).max(32).regex(/^[a-z][a-z0-9_]*$/),
      title: z.string().min(1).max(200),
      body: z.string().max(4000).optional(),
      link: z.string().max(2000).optional(),
      due: durationSchema,
      expire: durationSchema.optional(),
      connected_outcomes: z.array(z.string().min(1)).default(['connected']),
      dialer: z.boolean().default(false),
      auto_complete: z.boolean().default(true),
    })
    .strict();

  registry.registerNode({
    type: 'task',
    label: 'Task for the sender',
    params: taskParams,
    transitions: { keys: ['completed', 'no_answer'], required: [] },
    interpret: async (node, ctx) => {
      const p = taskParams.parse(node.params);
      const zone = ctx.timing.senderTz; // tasks follow the sender's calendar
      const dueAt = addDuration(ctx.now, p.due, zone);
      const expiresAt = p.expire ? addDuration(ctx.now, p.expire, zone) : addDuration(dueAt, '7d', zone);
      const title = render(p.title, ctx.template);
      const body = p.body ? render(p.body, ctx.template) : undefined;
      const link = p.link ? render(p.link, ctx.template) : undefined;
      const task: Extract<Effect, { kind: 'create_task' }>['task'] = {
        kind: p.kind,
        title: title.text,
        dueAt,
        expiresAt,
        connectedOutcomes: p.connected_outcomes,
        dialer: p.dialer,
        autoComplete: p.auto_complete,
        branchesByOutcome: node.branches_by_outcome ?? {},
      };
      if (body) task.body = body.text;
      if (link) task.link = link.text;
      if (node.next['completed']) task.onCompleted = node.next['completed'];
      if (node.next['no_answer']) task.onExpired = node.next['no_answer'];
      const rendered = { ...title.used, ...(body?.used ?? {}), ...(link?.used ?? {}) };
      return [{ kind: 'create_task', task, run: draft(node, false, { rendered, due_at: dueAt.toISOString(), expires_at: expiresAt.toISOString() }) }];
    },
  });

  registry.registerNode({
    type: 'outreach',
    label: 'Outreach',
    params: z.record(z.string(), z.unknown()),
    transitions: { keys: ['sent', 'skipped', 'failed'], required: [] },
    validate: (node) => {
      const problems: ValidationProblem[] = [];
      if (!node.channel) {
        problems.push({ path: `nodes.${node.id}.channel`, code: 'UNKNOWN_CHANNEL', message: 'An outreach step needs a channel.', severity: 'error' });
        return problems;
      }
      const channel = registry.channel(node.channel);
      if (!channel) {
        problems.push({ path: `nodes.${node.id}.channel`, code: 'UNKNOWN_CHANNEL', message: `"${node.channel}" is not a channel. Available: ${[...registry.channels.keys()].join(', ')}.`, severity: 'error' });
        return problems;
      }
      const action = node.action ? channel.actions[node.action] : undefined;
      if (!action) {
        problems.push({ path: `nodes.${node.id}.action`, code: 'UNKNOWN_ACTION', message: `"${node.action ?? ''}" is not an action of ${channel.label}. Available: ${Object.keys(channel.actions).join(', ')}.`, severity: 'error' });
        return problems;
      }
      const parsed = action.params.safeParse(node.params);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          problems.push({ path: `nodes.${node.id}.params.${issue.path.join('.')}`, code: 'INVALID_DEFINITION', message: issue.message, severity: 'error' });
        }
      }
      if (action.validate) problems.push(...action.validate(node, { nodes: {}, factFields: (f) => registry.factField(f) }));
      return problems;
    },
    interpret: async (node, ctx) => {
      const channel = node.channel ? registry.channel(node.channel) : undefined;
      const action = channel && node.action ? channel.actions[node.action] : undefined;
      if (!channel || !action) throw new Error(`outreach step "${node.id}" has an unknown channel or action`);
      const window = ctx.definition.settings.send_window;
      const at = computeNextAt({ now: ctx.now, window, jitter: ctx.definition.settings.jitter, zone: zoneFor(ctx), random: ctx.timing.random });
      if (at.getTime() > ctx.now.getTime() + 60_000) {
        // Outside the send window: come back when it opens. The executor re-checks the window anyway.
        return [{ kind: 'goto', nodeId: node.id, at }];
      }
      return [{ kind: 'enqueue', queue: channel.queue, run: draft(node, action.touch) }];
    },
  });

  // ---------------------------------------------------------------- channels
  registry.registerChannel({
    name: 'email',
    label: 'Email',
    queue: 'seq_email',
    actions: {
      send: {
        action: 'send',
        label: 'Send an email',
        touch: true,
        transitions: { keys: ['sent', 'skipped', 'failed'], required: [] },
        params: z
          .object({
            name: z.string().max(120).optional(),
            subject: z.string().min(1).max(300),
            body: z.string().min(1).max(100_000),
            format: z.enum(['text', 'html']).default('text'),
            reply_in_thread: z.boolean().default(false),
          })
          .strict(),
        validate: (node) => {
          const body = String(node.params['body'] ?? '');
          return body.includes('unsubscribe_url')
            ? []
            : [{ path: `nodes.${node.id}.params.body`, code: 'NO_UNSUBSCRIBE', message: 'This email has no {{ unsubscribe_url }}. Recipients cannot opt out with one click.', severity: 'warning' }];
        },
      },
    },
  });

  registry.registerChannel({
    name: 'sms',
    label: 'SMS',
    queue: 'seq_sms',
    actions: {
      send: {
        action: 'send',
        label: 'Send a text',
        touch: true,
        transitions: { keys: ['sent', 'skipped', 'failed'], required: [] },
        params: z.object({ name: z.string().max(120).optional(), body: z.string().min(1).max(DEFINITION_LIMITS.maxSmsChars) }).strict(),
        validate: (node) => {
          const body = String(node.params['body'] ?? '');
          if (body.length > 320) {
            return [{ path: `nodes.${node.id}.params.body`, code: 'TOO_LONG', message: `The SMS is ${body.length} characters (${Math.ceil(body.length / 153)} segments).`, severity: 'warning' }];
          }
          return [];
        },
      },
    },
  });

  // ---------------------------------------------------------------- facts
  registry.registerFacts({
    prefix: 'contact',
    label: 'Contact',
    fields: [
      { field: 'contact.country', label: 'Contact country', type: 'text' },
      { field: 'contact.timezone', label: 'Contact time zone', type: 'text' },
      { field: 'contact.has_email', label: 'Contact has an email', type: 'bool' },
      { field: 'contact.has_phone', label: 'Contact has a phone', type: 'bool' },
      { field: 'contact.has_linkedin', label: 'Contact has a LinkedIn URL', type: 'bool' },
      { field: 'contact.sms_consent', label: 'Contact consented to SMS', type: 'bool' },
    ],
  });
  registry.registerFacts({ prefix: 'attrs', label: 'Contact attributes', fields: [], open: true });
  registry.registerFacts({
    prefix: 'sender',
    label: 'Sender',
    fields: [
      { field: 'sender.timezone', label: 'Sender time zone', type: 'text' },
      { field: 'sender.has_sms', label: 'Sender has an SMS number', type: 'bool' },
      { field: 'sender.has_linkedin', label: 'Sender has LinkedIn', type: 'bool' },
    ],
  });
  registry.registerFacts({
    prefix: 'linkedin',
    label: 'LinkedIn',
    fields: [{ field: 'linkedin.connection_state', label: 'LinkedIn connection', type: 'enum', values: ['none', 'pending', 'connected', 'declined_or_ignored', 'withdrawn'] }],
  });
  registry.registerFacts({
    prefix: 'history',
    label: 'History',
    fields: [
      { field: 'history.touches', label: 'Touches so far', type: 'number' },
      { field: 'history.days_since_last_touch', label: 'Days since the last touch', type: 'number' },
      { field: 'history.replied_since_enrollment', label: 'Replied since enrollment', type: 'bool' },
      { field: 'history.last_reply_channel', label: 'Last reply channel', type: 'enum', values: ['email', 'sms', 'linkedin', 'call'] },
      { field: 'history.emails_sent', label: 'Emails sent', type: 'number' },
      { field: 'history.last_task_outcome', label: 'Last task outcome', type: 'text' },
      { field: 'history.last_task_kind', label: 'Last task kind', type: 'text' },
      { field: 'history.days_since_last_task', label: 'Days since the last task', type: 'number' },
      { field: 'history.tasks_last_14d', label: 'Tasks in the last 14 days', type: 'number' },
    ],
  });
  registry.registerFacts({
    prefix: 'crm',
    label: 'CRM',
    open: true,
    fields: [
      { field: 'crm.person.exists', label: 'CRM person exists', type: 'bool' },
      { field: 'crm.company.exists', label: 'CRM company exists', type: 'bool' },
      { field: 'crm.deal.exists', label: 'CRM open deal exists', type: 'bool' },
      { field: 'crm.deal.stage', label: 'CRM deal stage', type: 'text' },
      { field: 'crm.deal.count_open', label: 'CRM open deals', type: 'number' },
    ],
  });
}

let registered = false;
/** Idempotent: safe to call from every entry point. */
export function ensureBuiltins(): void {
  if (registered) return;
  registered = true;
  registerBuiltins();
}
