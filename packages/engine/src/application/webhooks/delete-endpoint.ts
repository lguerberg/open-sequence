import { notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';

/** Removes the endpoint and every delivery recorded for it (cascade). */
export async function deleteEndpoint(deps: Deps, projectId: string, endpointId: string): Promise<void> {
  await deps.uow.transaction(async ({ repos }) => {
    if (!(await repos.webhooks.endpoint(projectId, endpointId))) throw notFound('Webhook endpoint', endpointId);
    await repos.webhooks.deleteEndpoint(projectId, endpointId);
    deps.log.info({ projectId, endpointId }, 'webhook endpoint deleted');
  });
}
