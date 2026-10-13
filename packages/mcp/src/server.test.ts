/** The tools over MCP: what each one sends to the API, what it answers, and how refusals read. */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { API_KEY, BASE, connect, jsonOf, sid, textOf, type Harness } from './test-helpers.test.js';

const CONTRACT = [
  'list_sequences',
  'get_sequence',
  'validate_sequence_definition',
  'list_senders',
  'get_sender_readiness',
  'upsert_contact',
  'get_contact',
  'list_contacts',
  'get_contact_timeline',
  'preview_enrollment',
  'enroll_contacts',
  'exit_enrollment',
  'get_enrollment_journey',
  'list_enrollments',
  'list_tasks',
  'complete_task',
  'analytics_summary',
  'analytics_nodes',
  'report_contact_event',
];

const SEQ = sid('seq');
const VER = sid('ver');
const SND = sid('snd');

let h: Harness;
beforeEach(async () => {
  h = await connect();
});
afterEach(async () => {
  await h.close();
});

describe('tool list', () => {
  test('exposes exactly the contract names, each with a description and an object input schema', async () => {
    const tools = await h.client.listTools();
    expect(tools.map((t) => t.name)).toEqual(CONTRACT);
    for (const t of tools) {
      expect(t.description?.length).toBeGreaterThan(40);
      expect(t.inputSchema.type).toBe('object');
      // A schema without properties shows in clients as a tool with no arguments.
      expect(Object.keys(t.inputSchema.properties ?? {}).length).toBeGreaterThan(0);
    }
  });

  test('the schemas FastMCP cannot convert by itself keep their properties and descriptions', async () => {
    const tools = await h.client.listTools();
    const byName = new Map(tools.map((t) => [t.name, t]));
    const props = (name: string) =>
      byName.get(name)!.inputSchema.properties as Record<string, { description?: string }>;
    expect(Object.keys(props('enroll_contacts'))).toEqual([
      'sequence',
      'contacts',
      'sender',
      'version',
      'mode',
      'enrolled_by',
    ]);
    expect(props('enroll_contacts')['contacts']!.description).toContain('Who to enroll');
    expect(props('upsert_contact')).toHaveProperty('attrs');
    expect(props('preview_enrollment')).toHaveProperty('contacts');
    expect(props('validate_sequence_definition')).toHaveProperty('definition');
    expect(props('report_contact_event')).toHaveProperty('type');
  });

  test('read tools are marked read-only; write tools name the scope they need', async () => {
    const tools = await h.client.listTools();
    const byName = new Map(tools.map((t) => [t.name, t]));
    expect(byName.get('list_sequences')!.annotations?.readOnlyHint).toBe(true);
    const enroll = byName.get('enroll_contacts')!;
    expect(enroll.annotations?.readOnlyHint).toBe(false);
    expect(enroll.description).toContain('"enroll" scope');
    expect(enroll.inputSchema.required).toEqual(
      expect.arrayContaining(['sequence', 'contacts', 'sender'])
    );
    expect(byName.get('exit_enrollment')!.annotations?.destructiveHint).toBe(true);
    expect(byName.get('exit_enrollment')!.description).toContain('"admin" scope');
  });
});

describe('enroll_contacts', () => {
  const args = {
    sequence: 'uk-intro',
    contacts: ['p_7', 'p_8', { external_id: 'p_9', first_name: 'Sam', email: 'sam@example.com' }],
    sender: 'u_42',
  };

  test('posts the enrollment as an agent and answers with a summary, then the JSON', async () => {
    const data = {
      accepted: [
        { contact_id: 'ctc_7', external_id: 'p_7', first_touch_at: '2026-10-14T09:00:00.000Z' },
        { contact_id: 'ctc_8', external_id: 'p_8', first_touch_at: '2026-10-14T09:05:00.000Z' },
        { contact_id: 'ctc_9', external_id: 'p_9', first_touch_at: '2026-10-14T09:10:00.000Z' },
      ],
      skipped: [],
      capacity: { per_day: 30, days_to_first_touches: 1 },
      enrollments: [
        {
          id: 'enr_7',
          contact: 'ctc_7',
          status: 'active',
          next_run_at: '2026-10-14T09:00:00.000Z',
        },
        {
          id: 'enr_8',
          contact: 'ctc_8',
          status: 'active',
          next_run_at: '2026-10-14T09:05:00.000Z',
        },
        {
          id: 'enr_9',
          contact: 'ctc_9',
          status: 'active',
          next_run_at: '2026-10-14T09:10:00.000Z',
        },
      ],
    };
    h.fetch.reply(data);
    const result = await h.call('enroll_contacts', args);

    const req = h.fetch.last();
    expect(req.method).toBe('POST');
    expect(req.url).toBe(`${BASE}/v1/sequences/uk-intro/enrollments`);
    expect(req.headers['authorization']).toBe(`Bearer ${API_KEY}`);
    expect(req.body).toEqual({
      contacts: args.contacts,
      sender: 'u_42',
      enrolled_by_kind: 'agent',
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('Enrolled 3 contacts in uk-intro as u_42.');
    expect(textOf(result)).toContain(
      '- p_7: enrollment enr_7, active, next step 2026-10-14 09:00 UTC'
    );
    expect(jsonOf(result)).toEqual(data);
  });

  test('a 409 ALREADY_IN_SEQUENCE names the contact and says what to do', async () => {
    h.fetch.fail(409, {
      code: 'ALREADY_IN_SEQUENCE',
      message:
        '1 of the 3 contacts are already in a sequence. Nobody was enrolled. Remove them from the selection or exit them from their current sequence first.',
      details: {
        conflicts: [
          {
            contact_id: 'ctc_7',
            external_id: 'p_7',
            name: 'Dana Whitfield',
            sequence_id: 'seq_2',
            sequence_name: 'UK facilities managers',
            version: 'v1',
            sender: 'Priya Nair',
            enrollment_id: 'enr_old',
            status: 'active',
          },
        ],
      },
    });
    const result = await h.call('enroll_contacts', args);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'ALREADY_IN_SEQUENCE: Dana Whitfield is already in a sequence ("UK facilities managers", enrollment enr_old). Nobody was enrolled; exit that enrollment first (exit_enrollment) or pick another contact.'
    );
    const json = jsonOf(result) as {
      error: {
        code: string;
        status: number;
        details: { conflicts: unknown[] };
        request_id: string;
      };
    };
    expect(json.error).toMatchObject({
      code: 'ALREADY_IN_SEQUENCE',
      status: 409,
      request_id: 'req_err',
    });
    expect(json.error.details.conflicts).toHaveLength(1);
  });

  test('several conflicts are listed together', async () => {
    h.fetch.fail(409, {
      code: 'ALREADY_IN_SEQUENCE',
      message: '2 of the 3 contacts are already in a sequence.',
      details: {
        conflicts: [
          {
            contact_id: 'ctc_7',
            external_id: 'p_7',
            name: 'Dana Whitfield',
            sequence_id: 'seq_2',
            sequence_name: 'UK facilities managers',
            enrollment_id: 'enr_a',
            status: 'active',
          },
          {
            contact_id: 'ctc_8',
            external_id: 'p_8',
            name: null,
            sequence_id: 'seq_3',
            sequence_name: null,
            enrollment_id: 'enr_b',
            status: 'paused',
          },
        ],
      },
    });
    const text = textOf(await h.call('enroll_contacts', args));
    expect(text).toContain('Dana Whitfield and p_8 are already in a sequence');
    expect(text).toContain('p_8: seq_3, enrollment enr_b');
    expect(text).toContain('exit those enrollments first');
  });

  test("a read-scoped key gets the API's own 403 message, and the key never appears", async () => {
    h.fetch.fail(403, {
      code: 'INSUFFICIENT_SCOPE',
      message: 'This key cannot do that; it needs the "enroll" scope.',
    });
    const result = await h.call('enroll_contacts', args);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'INSUFFICIENT_SCOPE: This key cannot do that; it needs the "enroll" scope.'
    );
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });

  test('a version tag is resolved to the version id first', async () => {
    h.fetch.reply({
      id: SEQ,
      name: 'UK intro',
      status: 'active',
      defaultVersionId: VER,
      versions: [{ id: VER, tag: 'v2', status: 'published' }],
    });
    h.fetch.reply({
      accepted: [],
      skipped: [],
      capacity: { per_day: 30, days_to_first_touches: 0 },
      enrollments: [],
    });
    await h.call('enroll_contacts', { ...args, version: 'v2', mode: 'dry_run' });
    expect(h.fetch.calls[0]!.url).toBe(`${BASE}/v1/sequences/uk-intro`);
    expect(h.fetch.last().body).toMatchObject({
      version: VER,
      mode: 'dry_run',
      enrolled_by_kind: 'agent',
    });
  });

  test('invalid input is a tool error naming the field, refused before any request', async () => {
    const result = await h.call('enroll_contacts', {
      sequence: 'uk-intro',
      contacts: [],
      sender: 'u_42',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'VALIDATION_ERROR: Invalid arguments for enroll_contacts: contacts: Too small: expected array to have >=1 items.'
    );
    expect(jsonOf(result)).toMatchObject({
      error: { code: 'VALIDATION_ERROR', details: [{ path: 'contacts' }] },
    });
    expect(h.fetch.calls).toHaveLength(0);
  });

  test('a missing required argument is named too', async () => {
    const result = await h.call('enroll_contacts', { sequence: 'uk-intro', contacts: ['p_7'] });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(
      /^VALIDATION_ERROR: Invalid arguments for enroll_contacts: sender: /
    );
    expect(h.fetch.calls).toHaveLength(0);
  });
});

describe('sequences', () => {
  const detail = {
    id: SEQ,
    name: 'UK intro',
    status: 'active',
    defaultVersionId: VER,
    versions: [
      { id: VER, tag: 'v1', status: 'published' },
      { id: sid('ver', 'B'), tag: 'v2', status: 'draft' },
    ],
  };
  const definition = {
    schema_version: 1,
    entry: 'email_intro',
    nodes: {
      email_intro: {
        type: 'outreach',
        channel: 'email',
        action: 'send',
        params: { name: 'Intro email' },
        next: { sent: 'wait_2d' },
      },
      wait_2d: { type: 'wait', params: { duration: '2bd' }, next: { then: 'end' } },
    },
  };

  test('get_sequence reads the sequence, then its default version, and shows the steps', async () => {
    h.fetch.reply(detail);
    h.fetch.reply({
      version: { id: VER, tag: 'v1', status: 'published', definition },
      problems: [],
    });
    const result = await h.call('get_sequence', { sequence: 'uk-intro' });

    expect(h.fetch.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `GET ${BASE}/v1/sequences/uk-intro`,
      `GET ${BASE}/v1/sequences/${SEQ}/versions/${VER}`,
    ]);
    const text = textOf(result);
    expect(text).toContain(
      'UK intro (' + SEQ + ') is active. Versions: v1 published (default), v2 draft.'
    );
    expect(text).toContain('Version v1 (published) has 2 steps, starting at "email_intro":');
    expect(text).toContain('- email_intro: outreach email send "Intro email"');
    expect(text).toContain('No validation problems.');
    expect((jsonOf(result) as { version: { definition: unknown } }).version.definition).toEqual(
      definition
    );
  });

  test('an unknown version tag is refused with the tags that exist', async () => {
    h.fetch.reply(detail);
    const result = await h.call('get_sequence', { sequence: 'uk-intro', version: 'v9' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'VERSION_NOT_FOUND: Sequence "UK intro" has no version "v9". Its versions: v1, v2.'
    );
    expect(h.fetch.calls).toHaveLength(1);
  });

  test('validate_sequence_definition lists the problems with their paths', async () => {
    h.fetch.reply({
      ok: false,
      problems: [
        {
          path: 'nodes.wait_2d.next.then',
          code: 'UNKNOWN_NODE',
          message: 'Points to "end", which is not a node.',
          severity: 'error',
        },
      ],
    });
    const result = await h.call('validate_sequence_definition', { definition });
    expect(h.fetch.last()).toMatchObject({
      method: 'POST',
      url: `${BASE}/v1/sequences:validate`,
      body: { definition },
    });
    expect(textOf(result)).toBe(
      'Not valid: 1 error (they block publishing) and 0 warnings.\n- [error] nodes.wait_2d.next.then: Points to "end", which is not a node. (UNKNOWN_NODE)'
    );
  });
});

describe('filters take the ids an agent knows', () => {
  test('list_tasks turns a sender external id into the service id the filter needs', async () => {
    h.fetch.reply({ id: SND, externalId: 'u_42', name: 'Max Rivera' });
    h.fetch.reply(
      [
        {
          id: 'tsk_1',
          kind: 'call',
          title: 'Call Dana',
          contactId: 'ctc_7',
          status: 'open',
          dueAt: '2026-10-14T10:00:00.000Z',
        },
      ],
      'cur_2'
    );
    const result = await h.call('list_tasks', { sender: 'u_42', status: 'open' });
    expect(h.fetch.calls.map((c) => c.url)).toEqual([
      `${BASE}/v1/senders/u_42`,
      `${BASE}/v1/tasks?sender=${SND}&status=open`,
    ]);
    expect(textOf(result)).toBe(
      '1 task.\n- tsk_1: call "Call Dana" for contact ctc_7, open, due 2026-10-14 10:00 UTC\nMore results: call again with cursor "cur_2".'
    );
  });

  test('a service id goes straight through', async () => {
    h.fetch.reply([]);
    await h.call('list_enrollments', { sequence: SEQ, status: 'active' });
    expect(h.fetch.calls.map((c) => c.url)).toEqual([
      `${BASE}/v1/enrollments?sequence=${SEQ}&status=active`,
    ]);
  });

  test('list_contacts filters by email', async () => {
    h.fetch.reply(
      [
        {
          id: 'ctc_7',
          externalId: 'p_7',
          firstName: 'Dana',
          lastName: 'Whitfield',
          email: 'dana@example.com',
        },
      ],
      null
    );
    const result = await h.call('list_contacts', { email: 'dana@example.com' });
    expect(h.fetch.last().url).toBe(`${BASE}/v1/contacts?email=dana%40example.com`);
    expect(textOf(result)).toBe(
      '1 contact.\n- Dana Whitfield (external id p_7, ctc_7): dana@example.com'
    );
  });
});

describe('contacts, tasks and analytics', () => {
  test('report_contact_event generates an idempotency id when none is given', async () => {
    h.fetch.reply({ signal: 'sig_1', created: true });
    const result = await h.call('report_contact_event', { contact: 'p_7', type: 'meeting_booked' });
    const body = h.fetch.last().body as { id: string; type: string };
    expect(h.fetch.last().url).toBe(`${BASE}/v1/contacts/p_7/events`);
    expect(body.type).toBe('meeting_booked');
    expect(body.id).toMatch(/^mcp_[0-9a-f-]{36}$/);
    expect(textOf(result)).toContain(
      `Recorded meeting_booked for p_7 (event id ${body.id}, signal sig_1).`
    );
  });

  test('report_contact_event with a known id says nothing changed', async () => {
    h.fetch.reply({ signal: 'sig_1', created: false });
    const result = await h.call('report_contact_event', {
      contact: 'p_7',
      type: 'opt_out',
      channel: 'all',
      id: 'crm-dnc-7',
    });
    expect(h.fetch.last().body).toEqual({ id: 'crm-dnc-7', type: 'opt_out', channel: 'all' });
    expect(textOf(result)).toBe(
      'Event id crm-dnc-7 was already reported (signal sig_1); nothing changed.'
    );
  });

  test('complete_task says which branch the step takes', async () => {
    h.fetch.reply({
      id: 'tsk_1',
      title: 'Call Dana',
      status: 'done',
      outcome: 'connected',
      branchesByOutcome: { connected: 'end_connected' },
    });
    const result = await h.call('complete_task', {
      task: 'tsk_1',
      outcome: 'connected',
      note: 'Booked a demo',
    });
    expect(h.fetch.last()).toMatchObject({
      method: 'POST',
      url: `${BASE}/v1/tasks/tsk_1/complete`,
      body: { outcome: 'connected', note: 'Booked a demo' },
    });
    expect(textOf(result)).toBe(
      'Task tsk_1 ("Call Dana") is done. The step takes the "connected" branch.'
    );
  });

  test('analytics_summary without a sequence ranks every sequence', async () => {
    h.fetch.reply({
      sequences: [
        {
          sequence: SEQ,
          name: 'UK intro',
          status: 'active',
          enrolled: 40,
          replies: 8,
          meetings: 2,
          replies_per_100_enrolled: 20,
          meetings_per_100_enrolled: 5,
        },
      ],
    });
    const result = await h.call('analytics_summary', { min_enrolled: 10 });
    expect(h.fetch.last().url).toBe(`${BASE}/v1/analytics/sequences?min_enrolled=10`);
    expect(textOf(result)).toBe(
      `1 sequence, best first.\n- UK intro (${SEQ}, active): 40 enrolled, 8 replies (20/100), 2 meetings (5/100)`
    );
  });

  test('a network failure points at OPENSEQUENCE_URL', async () => {
    h.fetch.throwNext(new Error('connect ECONNREFUSED'));
    const result = await h.call('get_contact', { contact: 'p_7' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      `NETWORK_ERROR: Could not reach ${BASE}/v1/contacts/p_7: connect ECONNREFUSED. Check OPENSEQUENCE_URL and that the service is running.`
    );
  });
});
