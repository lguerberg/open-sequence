import type { AgentCallProvider, AgentCallSkills, AgentCallState } from '@opensequence/core';
import type { MockProviders } from './state.js';

/** Agent calls that go nowhere: each is kept in `mock.agentCalls`, open until a test or the dev hook sets its outcome. */
export class MockAgentCallProvider implements AgentCallProvider {
  constructor(private readonly mock: MockProviders) {}

  async create(req: { projectId: string; agentId: string; from: string; to: string; title: string; description?: string; dueAt?: Date; skills?: AgentCallSkills; idempotencyKey: string }): Promise<AgentCallState> {
    const existing = this.mock.agentCalls.find((c) => c.idempotencyKey === req.idempotencyKey);
    if (existing) return existing.state;
    const state: AgentCallState = { id: `mock-call:${req.idempotencyKey}`, status: 'open', outcome: null, attempts: 0, lastCallId: null };
    this.mock.agentCalls.push({ ...req, state, createdAt: this.mock.now() });
    return state;
  }

  async get(req: { projectId: string; id: string }): Promise<AgentCallState | null> {
    return this.mock.agentCalls.find((c) => c.projectId === req.projectId && c.state.id === req.id)?.state ?? null;
  }

  async find(req: { projectId: string; agentId: string; to: string; title: string; since: Date }): Promise<AgentCallState | null> {
    const matches = this.mock.agentCalls
      .filter((c) => c.projectId === req.projectId && c.agentId === req.agentId && c.to === req.to && c.title === req.title && c.createdAt >= req.since)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return matches[0]?.state ?? null;
  }

  async listAgents(): Promise<Array<{ id: string; name: string; numbers: string[] }>> {
    return [{ id: 'agt-mock', name: 'Mock outbound agent', numbers: ['+15550000001'] }];
  }
}
