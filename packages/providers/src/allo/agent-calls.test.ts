import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { StaticCredentials } from '../credentials.js';
import { AlloAgentCallProvider } from './agent-calls.js';
import { AlloApiError } from './client.js';

const BASE = 'https://allo.test';
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const credentials = new StaticCredentials({ prj_1: { allo: { api_key: 'allo-key' } } });
const calls = () => new AlloAgentCallProvider(credentials, { baseUrl: BASE });

// The response body of the public guide's create example.
const TASK = { id: 'tsk-1', status: 'TODO', title: 'Confirm Friday delivery', agent_id: 'agt-1', allo_number: '+14155550100', contact_number: '+14155551234', contact_id: null, due_at: null, attempts: 0, last_outcome: null, last_call_id: null, created_at: '2026-11-11T14:02:11', skills: {} };

describe('AlloAgentCallProvider', () => {
  it('creates the call on the agent endpoint with `Api-Key` auth and snake_case skills', async () => {
    let seen: { auth: string | null; body: unknown } | undefined;
    server.use(
      http.post(`${BASE}/v2/api/agents/agt-1/outbound_calls`, async ({ request }) => {
        seen = { auth: request.headers.get('authorization'), body: await request.json() };
        return HttpResponse.json({ data: TASK }, { status: 201 });
      }),
    );
    const state = await calls().create({
      projectId: 'prj_1',
      agentId: 'agt-1',
      from: '+14155550100',
      to: '+14155551234',
      title: 'Confirm Friday delivery',
      description: 'Jane ordered 3 pallets.',
      dueAt: new Date('2026-11-12T15:00:00Z'),
      skills: { sms: {}, book: { calendarId: 'exc-1', eventTypeId: '12345' }, transfer: { type: 'member', userId: 'usr-1' } },
      idempotencyKey: 'run_1',
    });
    expect(state).toEqual({ id: 'tsk-1', status: 'open', outcome: null, attempts: 0, lastCallId: null });
    expect(seen).toEqual({
      auth: 'Api-Key allo-key',
      body: {
        allo_number: '+14155550100',
        contact_number: '+14155551234',
        title: 'Confirm Friday delivery',
        description: 'Jane ordered 3 pallets.',
        due_at: '2026-11-12T15:00:00.000Z',
        skills: { sms: {}, book: { calendar_id: 'exc-1', event_type_id: '12345' }, transfer: { type: 'member', user_id: 'usr-1' } },
      },
    });
  });

  it('leaves out what was not given, and sends a fixed text and a number transfer as written', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(`${BASE}/v2/api/agents/agt-1/outbound_calls`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ data: TASK }, { status: 201 });
      }),
    );
    const base = { projectId: 'prj_1', agentId: 'agt-1', from: '+14155550100', to: '+14155551234', title: 'Hi', idempotencyKey: 'k' };
    await calls().create(base);
    await calls().create({ ...base, skills: { sms: { text: 'Here is the link' }, transfer: { type: 'external', number: '+14155559999' } } });
    expect(bodies[0]).toEqual({ allo_number: '+14155550100', contact_number: '+14155551234', title: 'Hi' });
    expect(bodies[1]).toMatchObject({ skills: { sms: { text: 'Here is the link' }, transfer: { type: 'external', number: '+14155559999' } } });
  });

  it('throws the documented error code', async () => {
    server.use(
      http.post(`${BASE}/v2/api/agents/agt-1/outbound_calls`, () =>
        HttpResponse.json({ error: { type: 'validation_error', code: 'LINE_NOT_AGENT_CALLING_LINE', message: "The Outbound agent 'agt-1' does not call from '+14155550199'.", retryable: false, request_id: 'req_1', param: 'allo_number' } }, { status: 400 }),
      ),
    );
    const err = await calls()
      .create({ projectId: 'prj_1', agentId: 'agt-1', from: '+14155550199', to: '+14155551234', title: 'Hi', idempotencyKey: 'k' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AlloApiError);
    expect((err as AlloApiError).status).toBe(400);
    expect((err as Error).message).toMatch(/^LINE_NOT_AGENT_CALLING_LINE: /);
  });

  it('reads a call back from its task', async () => {
    server.use(
      http.get(`${BASE}/v2/api/tasks/tsk-1`, () => HttpResponse.json({ data: { ...TASK, status: 'DONE', attempts: 2, last_outcome: 'reached', last_call_id: 'cal-9' } })),
      http.get(`${BASE}/v2/api/tasks/tsk-2`, () => HttpResponse.json({ data: { ...TASK, id: 'tsk-2', status: 'IN_PROGRESS', attempts: 1, last_outcome: 'voicemail' } })),
      http.get(`${BASE}/v2/api/tasks/tsk-gone`, () => HttpResponse.json({ error: { code: 'TASK_NOT_FOUND', message: 'No such task' } }, { status: 404 })),
    );
    expect(await calls().get({ projectId: 'prj_1', id: 'tsk-1' })).toEqual({ id: 'tsk-1', status: 'closed', outcome: 'reached', attempts: 2, lastCallId: 'cal-9' });
    expect(await calls().get({ projectId: 'prj_1', id: 'tsk-2' })).toEqual({ id: 'tsk-2', status: 'open', outcome: 'voicemail', attempts: 1, lastCallId: null });
    expect(await calls().get({ projectId: 'prj_1', id: 'tsk-gone' })).toBeNull();
  });

  it('finds a call it created earlier by number, objective and time', async () => {
    let query: string | undefined;
    server.use(
      http.get(`${BASE}/v2/api/tasks`, ({ request }) => {
        query = new URL(request.url).search;
        return HttpResponse.json({
          data: [
            { ...TASK, id: 'tsk-old', created_at: '2026-11-10T09:00:00' },
            { ...TASK, id: 'tsk-other', contact_number: '+14155550000' },
            { ...TASK, id: 'tsk-hit' },
          ],
        });
      }),
    );
    const req = { projectId: 'prj_1', agentId: 'agt-1', to: '+14155551234', title: 'Confirm Friday delivery' };
    expect((await calls().find({ ...req, since: new Date('2026-11-11T14:00:00Z') }))?.id).toBe('tsk-hit');
    expect(query).toBe('?action_type=OUTBOUND_CALL');
    expect(await calls().find({ ...req, since: new Date('2026-11-11T15:00:00Z') })).toBeNull();
  });

  it('lists outbound agents with the lines they call from', async () => {
    let query: string | undefined;
    server.use(
      http.get(`${BASE}/v2/api/agents`, ({ request }) => {
        query = new URL(request.url).search;
        return HttpResponse.json({ data: [{ id: 'agt-1', name: 'Outbound agent', type: 'AI_OUTBOUND', allo_numbers: ['+14155550100', '+14155550101'] }] });
      }),
    );
    expect(await calls().listAgents('prj_1')).toEqual([{ id: 'agt-1', name: 'Outbound agent', numbers: ['+14155550100', '+14155550101'] }]);
    expect(query).toBe('?type=AI_OUTBOUND&size=100');
  });
});
