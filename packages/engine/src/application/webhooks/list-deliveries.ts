import type { ListOptions, Page } from '../../domain/repositories.js';
import { notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { deliveryPayload } from './shared.js';

export async function listDeliveries(deps: Deps, projectId: string, endpointId: string, opts: ListOptions): Promise<Page<Record<string, unknown>>> {
  const repos = deps.uow.repos;
  if (!(await repos.webhooks.endpoint(projectId, endpointId))) throw notFound('Webhook endpoint', endpointId);
  const page = await repos.webhooks.listDeliveries(endpointId, opts);
  return { items: page.items.map(deliveryPayload), nextCursor: page.nextCursor };
}
