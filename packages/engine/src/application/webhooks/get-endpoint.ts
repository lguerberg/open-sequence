import { notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { endpointPayload } from './shared.js';

export async function getEndpoint(deps: Deps, projectId: string, endpointId: string): Promise<Record<string, unknown>> {
  const e = await deps.uow.repos.webhooks.endpoint(projectId, endpointId);
  if (!e) throw notFound('Webhook endpoint', endpointId);
  return endpointPayload(e);
}
