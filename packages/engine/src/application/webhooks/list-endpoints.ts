import type { Deps } from '../deps.js';
import { endpointPayload } from './shared.js';

export async function listEndpoints(deps: Deps, projectId: string): Promise<Record<string, unknown>[]> {
  return (await deps.uow.repos.webhooks.endpoints(projectId)).map(endpointPayload);
}
