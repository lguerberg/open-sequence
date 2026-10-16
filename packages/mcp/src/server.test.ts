/** The tools over MCP: what each one sends to the API, what it answers, and how refusals read. */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { API_KEY, BASE, connect, jsonOf, sid, textOf, type Harness } from './test-helpers.test.js';

const CONTRACT = [
  'list_sequences',
  'get_sequence',
  'validate_sequence_definition',
  'get_sequence_version',
  'create_sequence',
  'save_sequence_draft',
  'publish_sequence_version',
  'create_sequence_version',
  'set_sequence_status',
  'list_senders',
  'get_sender',
  'get_sender_readiness',
  'upsert_sender',
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
  test('stays small enough to load into every session', async () => {
    // Every connected client loads the whole list into its context: about 34k characters today.
    const tools = await h.client.listTools();
    expect(JSON.stringify(tools).length).toBeLessThan(36_000);
  });

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
    expect(Object.keys(props('save_sequence_draft'))).toEqual([
      'sequence',
      'version',
      'definition',
      'lock_version',
    ]);
    // The format guide lives once, on validate_sequence_definition; the others point to it.
    expect(props('validate_sequence_definition')['definition']!.description).toContain(
      '{{ sender.signature }}'
    );
    expect(props('create_sequence')['definition']!.description).toContain(
      'validate_sequence_definition'
    );
    expect(props('save_sequence_draft')['definition']!.description).toContain(
      'validate_sequence_definition'
    );
    expect(props('upsert_sender')).toHaveProperty('signature_html');
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
    for (const name of [
      'create_sequence',
      'save_sequence_draft',
      'publish_sequence_version',
      'create_sequence_version',
      'set_sequence_status',
      'upsert_sender',
    ]) {
      expect(byName.get(name)!.annotations?.readOnlyHint).toBe(false);
      expect(byName.get(name)!.description).toContain('"admin" scope');
    }
    expect(byName.get('get_sequence_version')!.annotations?.readOnlyHint).toBe(true);
    expect(byName.get('get_sender')!.annotations?.readOnlyHint).toBe(true);
    expect(byName.get('set_sequence_status')!.annotations?.destructiveHint).toBe(true);
    expect(byName.get('publish_sequence_version')!.annotations?.destructiveHint).toBe(false);
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

describe('building a sequence', () => {
  const V2 = sid('ver', 'B');
  const definition = {
    schema_version: 1,
    entry: 'email_intro',
    exit_on: ['reply'],
    nodes: {
      email_intro: {
        type: 'outreach',
        channel: 'email',
        action: 'send',
        params: { subject: 'Hi {{ contact.first_name | "there" }}', body: 'Hello' },
        next: { sent: 'end' },
      },
      end: { type: 'end' },
    },
  };
  const warning = {
    path: 'nodes.email_intro.params.body',
    code: 'NO_UNSUBSCRIBE',
    message: 'The body has no {{ unsubscribe_url }}.',
    severity: 'warning',
  };
  const version = (over: Record<string, unknown> = {}) => ({
    id: VER,
    sequenceId: SEQ,
    tag: 'v1',
    status: 'draft',
    definition,
    lockVersion: 0,
    basedOnVersionId: null,
    ...over,
  });
  const detail = {
    id: SEQ,
    name: 'UK intro',
    status: 'active',
    defaultVersionId: VER,
    versions: [
      { id: VER, tag: 'v1', status: 'published' },
      { id: V2, tag: 'v2', status: 'draft' },
    ],
  };

  test('create_sequence posts the sequence with its definition and names the draft to edit', async () => {
    const data = {
      sequence: { id: SEQ, name: 'UK intro', externalId: 'uk-intro', status: 'active' },
      version: version(),
      problems: [warning],
    };
    h.fetch.reply(data);
    const result = await h.call('create_sequence', {
      name: 'UK intro',
      external_id: 'uk-intro',
      definition,
    });
    expect(h.fetch.last()).toMatchObject({
      method: 'POST',
      url: `${BASE}/v1/sequences`,
      body: { name: 'UK intro', external_id: 'uk-intro', definition },
    });
    const text = textOf(result);
    expect(text).toContain(
      `Created sequence "UK intro" (${SEQ}, external id uk-intro) with draft v1 (${VER}, lock_version 0).`
    );
    expect(text).toContain('1 warning (they do not block publishing):');
    expect(text).toContain('[warning] nodes.email_intro.params.body');
    expect(text).toContain('publish_sequence_version');
    expect(jsonOf(result)).toEqual(data);
  });

  test("create_sequence with a read key gets the API's 403", async () => {
    h.fetch.fail(403, {
      code: 'INSUFFICIENT_SCOPE',
      message: 'This key cannot do that; it needs the "admin" scope.',
    });
    const result = await h.call('create_sequence', { name: 'UK intro' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'INSUFFICIENT_SCOPE: This key cannot do that; it needs the "admin" scope.'
    );
  });

  test('get_sequence_version resolves a tag and gives the lock_version to save with', async () => {
    h.fetch.reply(detail);
    h.fetch.reply({ version: version({ id: V2, tag: 'v2', lockVersion: 3 }), problems: [] });
    const result = await h.call('get_sequence_version', { sequence: 'uk-intro', version: 'v2' });
    expect(h.fetch.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `GET ${BASE}/v1/sequences/uk-intro`,
      `GET ${BASE}/v1/sequences/uk-intro/versions/${V2}`,
    ]);
    const text = textOf(result);
    expect(text).toContain(`Version v2 (${V2}) is draft, lock_version 3, with 2 steps`);
    expect(text).toContain(
      `To edit it, call save_sequence_draft with version ${V2} and lock_version 3.`
    );
  });

  test('get_sequence_version with an unknown tag names the tags that exist', async () => {
    h.fetch.reply(detail);
    const result = await h.call('get_sequence_version', { sequence: 'uk-intro', version: 'v7' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'VERSION_NOT_FOUND: Sequence "UK intro" has no version "v7". Its versions: v1, v2.'
    );
  });

  test('save_sequence_draft puts the whole definition under the lock and gives the next lock_version', async () => {
    h.fetch.reply({ version: version({ lockVersion: 1 }), problems: [warning] });
    const result = await h.call('save_sequence_draft', {
      sequence: SEQ,
      version: VER,
      definition,
      lock_version: 0,
    });
    expect(h.fetch.calls).toHaveLength(1);
    expect(h.fetch.last()).toMatchObject({
      method: 'PUT',
      url: `${BASE}/v1/sequences/${SEQ}/versions/${VER}/draft`,
      body: { definition, lock_version: 0 },
    });
    const text = textOf(result);
    expect(text).toContain(`Saved draft v1 (${VER}): 2 steps, starting at "email_intro":`);
    expect(text).toContain('lock_version is now 1; send that with the next save.');
    expect(text).toContain('Ready to publish with publish_sequence_version.');
  });

  test('save_sequence_draft explains a lock conflict: read again, then retry', async () => {
    h.fetch.fail(409, {
      code: 'STALE_LOCK',
      message: 'Someone else saved this draft after you loaded it. Reload and try again.',
    });
    const result = await h.call('save_sequence_draft', {
      sequence: SEQ,
      version: VER,
      definition,
      lock_version: 0,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'STALE_LOCK: Someone saved this draft after you read it, so your save was refused and nothing changed. Read the version again (get_sequence_version), apply your edit to that definition, and save with the lock_version it returns.'
    );
  });

  test('save_sequence_draft on a published version points at create_sequence_version', async () => {
    h.fetch.fail(409, {
      code: 'VERSION_NOT_EDITABLE',
      message: 'Version v1 is published and cannot be edited. Create a new version from it.',
    });
    const result = await h.call('save_sequence_draft', {
      sequence: SEQ,
      version: VER,
      definition,
      lock_version: 2,
    });
    expect(textOf(result)).toBe(
      'VERSION_NOT_EDITABLE: Version v1 is published and cannot be edited. Create a new version from it. Published versions never change: make a new draft from it (create_sequence_version), edit that, and publish it.'
    );
  });

  test('publish_sequence_version publishes and says who it affects', async () => {
    h.fetch.reply({ version: version({ status: 'published' }), problems: [warning] });
    const result = await h.call('publish_sequence_version', {
      sequence: SEQ,
      version: VER,
      published_by: 'leo@example.com',
    });
    expect(h.fetch.last()).toMatchObject({
      method: 'POST',
      url: `${BASE}/v1/sequences/${SEQ}/versions/${VER}/publish`,
      body: { published_by: 'leo@example.com' },
    });
    const text = textOf(result);
    expect(text).toContain(
      `Published v1 (${VER}) of ${SEQ}. It is now the default version: new enrollments use it, and contacts already enrolled finish the version they started.`
    );
    expect(text).toContain('1 warning');
  });

  test('publish_sequence_version refused by the validator lists the errors in plain English', async () => {
    h.fetch.fail(422, {
      code: 'INVALID_DEFINITION',
      message: 'The definition has errors; fix them before publishing.',
      details: {
        problems: [
          {
            path: 'nodes.email_intro.params.subject',
            code: 'BAD_TEMPLATE',
            message: 'contact.first_name can be empty for some contacts. Give it a fallback.',
            severity: 'error',
          },
          {
            path: 'nodes.wait_2d',
            code: 'UNREACHABLE_NODE',
            message: 'No path from the entry reaches this node.',
            severity: 'error',
          },
          warning,
        ],
      },
    });
    const result = await h.call('publish_sequence_version', { sequence: SEQ, version: VER });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'INVALID_DEFINITION: Not published: the definition has 2 errors, and errors block publishing. nodes.email_intro.params.subject: contact.first_name can be empty for some contacts. Give it a fallback. (BAD_TEMPLATE); nodes.wait_2d: No path from the entry reaches this node. (UNREACHABLE_NODE). Fix them in the draft (save_sequence_draft), then publish again.'
    );
    expect(jsonOf(result)).toMatchObject({
      error: { code: 'INVALID_DEFINITION', status: 422 },
    });
  });

  test('create_sequence_version copies a version by tag into the next free tag', async () => {
    h.fetch.reply(detail);
    h.fetch.reply({ ...version({ id: sid('ver', 'C'), tag: 'v3', basedOnVersionId: VER }) });
    const result = await h.call('create_sequence_version', {
      sequence: 'uk-intro',
      from_version: 'v1',
    });
    expect(h.fetch.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `GET ${BASE}/v1/sequences/uk-intro`,
      `POST ${BASE}/v1/sequences/${SEQ}/versions`,
    ]);
    expect(h.fetch.last().body).toEqual({ tag: 'v3', from_version: VER });
    expect(textOf(result)).toContain(
      `Created draft v3 (${sid('ver', 'C')}) of "UK intro", copied from v1.`
    );
  });

  test('create_sequence_version with a tag in use says how to pick another', async () => {
    h.fetch.reply(detail);
    h.fetch.fail(409, { code: 'TAG_TAKEN', message: 'Version v2 already exists.' });
    const result = await h.call('create_sequence_version', { sequence: 'uk-intro', tag: 'v2' });
    expect(h.fetch.last().body).toEqual({ tag: 'v2' });
    expect(textOf(result)).toBe(
      'TAG_TAKEN: Version v2 already exists. Pick another tag, or leave tag out to get the next free one.'
    );
  });

  test('set_sequence_status pauses a sequence', async () => {
    h.fetch.reply({ id: SEQ, name: 'UK intro', status: 'paused' });
    const result = await h.call('set_sequence_status', { sequence: 'uk-intro', status: 'paused' });
    expect(h.fetch.last()).toMatchObject({
      method: 'PATCH',
      url: `${BASE}/v1/sequences/uk-intro`,
      body: { status: 'paused' },
    });
    expect(textOf(result)).toBe(
      `"UK intro" (${SEQ}) is now paused. No step runs until it is active again; contacts keep their place.`
    );
  });

  test('archiving a sequence with contacts in it is refused with the way out', async () => {
    h.fetch.fail(409, {
      code: 'HAS_ACTIVE_ENROLLMENTS',
      message: '4 contacts are still in this sequence. Exit them first, or send exit_active: true.',
      details: { active: 4 },
    });
    const result = await h.call('set_sequence_status', {
      sequence: 'uk-intro',
      status: 'archived',
    });
    expect(textOf(result)).toBe(
      'HAS_ACTIVE_ENROLLMENTS: 4 contacts are still in this sequence, so it was not archived. Pause it instead (status "paused"), or archive with exit_active: true, which exits every one of them now.'
    );
  });
});

describe('senders and signatures', () => {
  const stored = {
    id: SND,
    externalId: 'u_42',
    name: 'Max Rivera',
    email: 'max@acme.com',
    timezone: 'Europe/London',
    status: 'active',
    attrs: { team: 'uk' },
    signatureHtml: null,
    signatureText: null,
    channels: [{ channel: 'email', address: 'max@acme.com', status: 'active', dailyLimit: 30 }],
    readiness: { email: { ok: true }, sms: { ok: false, reason: 'no_sms_channel' } },
    connections: [],
  };

  test('get_sender shows the signature, channels and readiness', async () => {
    h.fetch.reply(stored);
    const result = await h.call('get_sender', { sender: 'u_42' });
    expect(h.fetch.last().url).toBe(`${BASE}/v1/senders/u_42`);
    expect(textOf(result)).toBe(
      [
        `Max Rivera (external id u_42, ${SND}): max@acme.com, Europe/London, active.`,
        'Signature: not set; {{ sender.signature }} renders as nothing.',
        'Channels:',
        '- email max@acme.com: active, up to 30 a day',
        'Cannot run: sms (no_sms_channel).',
      ].join('\n')
    );
  });

  test("get_sender for an unknown sender is the API's 404", async () => {
    h.fetch.fail(404, { code: 'NOT_FOUND', message: 'Sender "u_99" was not found.' });
    const result = await h.call('get_sender', { sender: 'u_99' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('NOT_FOUND: Sender "u_99" was not found.');
  });

  test('upsert_sender with only a signature keeps the stored name, email, zone and attrs', async () => {
    h.fetch.reply(stored);
    h.fetch.reply({
      ...stored,
      signatureHtml: '<p>Max Rivera<br>Acme</p>',
      signatureText: 'Max Rivera\nAcme',
    });
    const result = await h.call('upsert_sender', {
      sender: 'u_42',
      signature_html: '<p>Max Rivera<br>Acme</p>',
    });
    expect(h.fetch.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `GET ${BASE}/v1/senders/u_42`,
      `PUT ${BASE}/v1/senders/u_42`,
    ]);
    expect(h.fetch.last().body).toEqual({
      name: 'Max Rivera',
      email: 'max@acme.com',
      timezone: 'Europe/London',
      attrs: { team: 'uk' },
      signature_html: '<p>Max Rivera<br>Acme</p>',
    });
    expect(textOf(result)).toBe(
      `Updated sender Max Rivera (external id u_42, ${SND}): max@acme.com, Europe/London.\nSignature: set (HTML and text): "Max Rivera Acme".`
    );
  });

  test('upsert_sender creates a new sender by external id, and a snd_ id resolves to it', async () => {
    h.fetch.fail(404, { code: 'NOT_FOUND', message: 'Sender "u_7" was not found.' });
    h.fetch.reply({
      ...stored,
      externalId: 'u_7',
      name: 'Priya Nair',
      email: null,
      timezone: 'UTC',
    });
    const result = await h.call('upsert_sender', { sender: 'u_7', name: 'Priya Nair' });
    expect(h.fetch.last()).toMatchObject({
      method: 'PUT',
      url: `${BASE}/v1/senders/u_7`,
      body: { name: 'Priya Nair' },
    });
    expect(textOf(result)).toContain('Created sender Priya Nair (external id u_7');

    h.fetch.reply(stored);
    h.fetch.reply(stored);
    await h.call('upsert_sender', { sender: SND, timezone: 'Europe/Paris' });
    expect(h.fetch.last().url).toBe(`${BASE}/v1/senders/u_42`);
    expect(h.fetch.last().body).toMatchObject({ timezone: 'Europe/Paris', name: 'Max Rivera' });
  });

  test('upsert_sender for a new sender without a name is refused before any write', async () => {
    h.fetch.fail(404, { code: 'NOT_FOUND', message: 'Sender "u_7" was not found.' });
    const result = await h.call('upsert_sender', { sender: 'u_7', signature_text: 'Priya' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'VALIDATION_ERROR: There is no sender "u_7" yet. Give a name to create one.'
    );
    expect(h.fetch.calls).toHaveLength(1);
  });
});
