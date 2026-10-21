import { describe, expect, it } from 'vitest';
import { validateDefinition } from './validate.js';

const good = () => ({
  schema_version: 1,
  entry: 'email_intro',
  settings: { send_window: { days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '08:00', to: '18:00', tz: 'contact' }, jitter: '15m', reenroll: 'after_90d' },
  exit_on: ['reply', 'meeting_booked'],
  nodes: {
    email_intro: {
      type: 'outreach',
      channel: 'email',
      action: 'send',
      params: { subject: 'Quick question, {{ contact.first_name | "there" }}', body: 'Hello {{ unsubscribe_url }}' },
      next: { sent: 'wait_2d', skipped: 'wait_2d', failed: 'end_failed' },
    },
    wait_2d: { type: 'wait', params: { duration: '2bd' }, next: { then: 'check_stage' } },
    check_stage: {
      type: 'condition',
      params: { mode: 'all', rules: [{ field: 'history.last_task_outcome', op: 'is', value: 'voicemail' }, { field: 'attrs.deal.stage', op: 'is', value: 'contacting' }] },
      next: { yes: 'call_1', no: 'sms_follow' },
    },
    sms_follow: { type: 'outreach', channel: 'sms', action: 'send', params: { body: 'Hi {{ contact.first_name | "there" }}' }, next: { sent: 'end_done' } },
    call_1: {
      type: 'task',
      params: { kind: 'call', title: 'Call {{ contact.first_name | "them" }}', due: '1bd', expire: '3bd', dialer: true },
      next: { completed: 'end_done', no_answer: 'wait_2d' },
      branches_by_outcome: { connected: 'end_done' },
    },
    end_done: { type: 'end', params: { label: 'Done' } },
    end_failed: { type: 'end' },
  },
});

const codes = (r: ReturnType<typeof validateDefinition>) => r.problems.map((p) => p.code);

describe('validateDefinition', () => {
  it('accepts a good definition', () => {
    const r = validateDefinition(good());
    expect(r.problems.filter((p) => p.severity === 'error')).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.definition?.settings.reenroll).toBe('after_90d');
  });

  it('reports schema problems with a path and INVALID_DEFINITION', () => {
    const d = good();
    (d.nodes.wait_2d.params as { duration: string }).duration = '2 days';
    const r = validateDefinition(d);
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatchObject({ code: 'INVALID_DEFINITION', path: 'nodes.wait_2d.params.duration' });
  });

  it('catches unknown targets, unknown fields and bad operators', () => {
    const d = good();
    d.nodes.wait_2d.next.then = 'nowhere';
    d.nodes.check_stage.params.rules[0] = { field: 'nope.x', op: 'is', value: '1' };
    d.nodes.check_stage.params.rules[1] = { field: 'history.touches', op: 'contains', value: 'a' };
    const r = validateDefinition(d);
    expect(codes(r)).toEqual(expect.arrayContaining(['UNKNOWN_NODE', 'UNKNOWN_FIELD', 'BAD_OPERATOR']));
  });

  it('refuses a required template field without a fallback and an unknown root', () => {
    const d = good();
    d.nodes.email_intro.params.subject = 'Hi {{ contact.first_name }}';
    d.nodes.email_intro.params.body = '{{ deal.value }} {{ unsubscribe_url }}';
    const r = validateDefinition(d);
    expect(codes(r).filter((c) => c === 'BAD_TEMPLATE')).toHaveLength(2);
  });

  it('warns, but does not block, an email without an unsubscribe link', () => {
    const d = good();
    d.nodes.email_intro.params.body = 'no link';
    const r = validateDefinition(d);
    expect(r.ok).toBe(true);
    expect(r.problems.find((p) => p.code === 'NO_UNSUBSCRIBE')?.severity).toBe('warning');
  });

  it('finds unreachable nodes and missing required transitions, and allows several texts', () => {
    const d = good();
    (d.nodes as Record<string, unknown>)['orphan'] = { type: 'end' };
    delete (d.nodes.check_stage.next as Record<string, string>)['no'];
    (d.nodes as Record<string, unknown>)['sms_2'] = { type: 'outreach', channel: 'sms', action: 'send', params: { body: 'x' }, next: {} };
    d.nodes.email_intro.next.skipped = 'sms_2';
    const r = validateDefinition(d);
    expect(codes(r)).toEqual(expect.arrayContaining(['UNREACHABLE_NODE', 'MISSING_TRANSITION']));
    expect(codes(r)).not.toContain('TOO_MANY_SMS');
  });

  it('rejects a loop with no wait in it and allows one through a wait', () => {
    const d = good();
    d.nodes.check_stage.next.no = 'check_stage';
    expect(codes(validateDefinition(d))).toContain('CYCLE');
    const ok = good(); // call_1.no_answer -> wait_2d -> check_stage -> call_1 is a loop through a wait and a task
    expect(codes(validateDefinition(ok))).not.toContain('CYCLE');
  });

  it('reports an unknown channel or action in plain words', () => {
    const d = good();
    d.nodes.sms_follow.channel = 'fax';
    const r = validateDefinition(d);
    expect(r.problems.find((p) => p.code === 'UNKNOWN_CHANNEL')?.message).toContain('Available: email, sms');
  });
});

describe('email size limits and HEAVY_EMAIL', () => {
  const withBody = (body: string, format?: 'text' | 'html') => {
    const d = good();
    d.nodes.email_intro.params = { subject: 'Hi', body: `${body} {{ unsubscribe_url }}`, ...(format ? { format } : {}) } as typeof d.nodes.email_intro.params;
    return d;
  };
  const img = (bytes: number, fill = 5) => `<img alt="x" src="data:image/png;base64,${Buffer.alloc(bytes, fill).toString('base64')}">`;

  it('keeps 100,000 characters for a text body and allows 5,000,000 for html', () => {
    const long = 'a'.repeat(150_000);
    const text = validateDefinition(withBody(long));
    expect(text.ok).toBe(false);
    expect(text.problems[0]).toMatchObject({ path: 'nodes.email_intro.params.body', code: 'INVALID_DEFINITION' });
    expect(text.problems[0]!.message).toContain('100,000');
    expect(validateDefinition(withBody(long, 'html')).ok).toBe(true);
    expect(validateDefinition(withBody('a'.repeat(5_000_001), 'html')).ok).toBe(false);
  });

  it('accepts a definition up to 10 MB and refuses a larger one', () => {
    const d = withBody(img(2 * 1024 * 1024), 'html');
    expect(Buffer.byteLength(JSON.stringify(d))).toBeGreaterThan(256 * 1024);
    expect(validateDefinition(d).ok).toBe(true);
    const huge = { ...good(), padding: 'x'.repeat(10 * 1024 * 1024) };
    const r = validateDefinition(huge);
    expect(r.ok).toBe(false);
    expect(r.problems[0]!.message).toContain('the limit is 10 MB');
  });

  it('warns HEAVY_EMAIL when the embedded images pass 400 KB, without blocking', () => {
    const light = validateDefinition(withBody(img(300 * 1024), 'html'));
    expect(codes(light)).not.toContain('HEAVY_EMAIL');
    const heavy = validateDefinition(withBody(img(300 * 1024, 1) + img(200 * 1024, 2), 'html'));
    expect(heavy.ok).toBe(true);
    expect(heavy.problems.find((p) => p.code === 'HEAVY_EMAIL')).toMatchObject({ severity: 'warning', path: 'nodes.email_intro.params.body' });
    // The same image twice is one attachment: not heavy.
    expect(codes(validateDefinition(withBody(img(300 * 1024) + img(300 * 1024), 'html')))).not.toContain('HEAVY_EMAIL');
    // A text body never warns.
    expect(codes(validateDefinition(withBody('x')))).not.toContain('HEAVY_EMAIL');
  });
});
