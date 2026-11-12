import type { AgentCallProvider, AgentCallSkills, AgentCallState } from '@opensequence/core';
import { requireCredentials, type CredentialSource } from '../credentials.js';
import { KeyedTokenBuckets } from '../token-bucket.js';
import { asDate, asNumber, asString, isRecord } from '../http.js';
import { ALLO_BASE_URL, AlloApiError, AlloClient, unwrapData, unwrapList } from './client.js';
import type { AlloOptions } from './sms.js';

/** Scopes the Allo key needs for agent calls, on top of the ones texts and call tasks need. */
export const ALLO_AGENT_CALL_SCOPES = ['OUTBOUND_CALLS_WRITE', 'AGENTS_READ', 'TASKS_READ'] as const;

const CLOSED = new Set(['DONE', 'CANCELED', 'CANCELLED']);

/**
 * Allo's Outbound agent: `POST /v2/api/agents/{agent}/outbound_calls` creates a call, which is a
 * task in the workspace; `GET /v2/api/tasks/{id}` reads how it went. Allo places the call inside
 * the agent's calling hours and retries it; nothing here dials.
 */
export class AlloAgentCallProvider implements AgentCallProvider {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly writes: KeyedTokenBuckets;

  constructor(
    private readonly credentials: CredentialSource,
    opts: AlloOptions = {},
  ) {
    this.baseUrl = opts.baseUrl ?? ALLO_BASE_URL;
    this.fetchImpl = opts.fetch ?? fetch;
    this.writes = new KeyedTokenBuckets(opts.writesPerSecond ?? 5);
  }

  private async client(projectId: string): Promise<AlloClient> {
    const { api_key } = await requireCredentials(this.credentials, projectId, 'allo');
    if (!api_key) throw new Error('CREDENTIALS_MISSING: the allo credential has no api_key');
    return new AlloClient(api_key, this.baseUrl, this.fetchImpl, 'Api-Key');
  }

  async create(req: { projectId: string; agentId: string; from: string; to: string; title: string; description?: string; dueAt?: Date; skills?: AgentCallSkills; idempotencyKey: string }): Promise<AgentCallState> {
    const client = await this.client(req.projectId);
    await this.writes.take(req.projectId);
    const skills = skillsBody(req.skills);
    const res = await client.post(`/v2/api/agents/${encodeURIComponent(req.agentId)}/outbound_calls`, {
      allo_number: req.from,
      contact_number: req.to,
      title: req.title,
      ...(req.description ? { description: req.description } : {}),
      ...(req.dueAt ? { due_at: req.dueAt.toISOString() } : {}),
      ...(skills ? { skills } : {}),
    });
    const state = toState(unwrapData(res));
    if (!state) throw new Error('ALLO_BAD_RESPONSE: Allo created the call but returned no task id');
    return state;
  }

  async get(req: { projectId: string; id: string }): Promise<AgentCallState | null> {
    const client = await this.client(req.projectId);
    try {
      return toState(unwrapData(await client.get(`/v2/api/tasks/${encodeURIComponent(req.id)}`)));
    } catch (err) {
      if (err instanceof AlloApiError && err.status === 404) return null;
      throw err;
    }
  }

  async find(req: { projectId: string; agentId: string; to: string; title: string; since: Date }): Promise<AgentCallState | null> {
    const client = await this.client(req.projectId);
    const matches = unwrapList(await client.get('/v2/api/tasks', { action_type: 'OUTBOUND_CALL' }))
      .filter((t) => asString(t.contact_number) === req.to && asString(t.title) === req.title && (t.agent_id === undefined || asString(t.agent_id) === req.agentId))
      // Response timestamps carry no offset; they are UTC.
      .map((t) => ({ state: toState(t), at: asDate(typeof t.created_at === 'string' && !/[zZ]|[+-]\d\d:?\d\d$/.test(t.created_at) ? `${t.created_at}Z` : t.created_at) }))
      .filter((m): m is { state: AgentCallState; at: Date } => !!m.state && !!m.at && m.at >= req.since)
      .sort((a, b) => b.at.getTime() - a.at.getTime());
    return matches[0]?.state ?? null;
  }

  async listAgents(projectId: string): Promise<Array<{ id: string; name: string; numbers: string[] }>> {
    const client = await this.client(projectId);
    return unwrapList(await client.get('/v2/api/agents', { type: 'AI_OUTBOUND', size: 100 }))
      .filter((a) => asString(a.id))
      .map((a) => ({
        id: asString(a.id) as string,
        name: asString(a.name) ?? '',
        numbers: Array.isArray(a.allo_numbers) ? a.allo_numbers.filter((n): n is string => typeof n === 'string') : [],
      }));
  }
}

function skillsBody(skills: AgentCallSkills | undefined): Record<string, unknown> | undefined {
  if (!skills) return undefined;
  const body: Record<string, unknown> = {};
  if (skills.sms) body.sms = skills.sms.text ? { text: skills.sms.text } : {};
  if (skills.book) body.book = { calendar_id: skills.book.calendarId, event_type_id: skills.book.eventTypeId };
  if (skills.transfer) body.transfer = skills.transfer.type === 'member' ? { type: 'member', user_id: skills.transfer.userId } : { type: skills.transfer.type, number: skills.transfer.number };
  return Object.keys(body).length ? body : undefined;
}

function toState(task: unknown): AgentCallState | null {
  if (!isRecord(task)) return null;
  const id = asString(task.id);
  if (!id) return null;
  return {
    id,
    status: CLOSED.has((asString(task.status) ?? '').toUpperCase()) ? 'closed' : 'open',
    outcome: asString(task.last_outcome)?.toLowerCase() ?? null,
    attempts: asNumber(task.attempts) ?? 0,
    lastCallId: asString(task.last_call_id) ?? null,
  };
}
