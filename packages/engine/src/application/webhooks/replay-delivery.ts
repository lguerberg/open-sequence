import { conflict, notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { deliveryPayload, WEBHOOK_QUEUE } from './shared.js';

/** Sends one delivery again, whatever its state, with a fresh attempt counter. */
export async function replayDelivery(deps: Deps, projectId: string, deliveryId: string): Promise<Record<string, unknown>> {
  return deps.uow.transaction(async ({ repos, tx }) => {
    const d = await repos.webhooks.lockDelivery(deliveryId);
    if (!d || d.projectId !== projectId) throw notFound('Webhook delivery', deliveryId);
    const endpoint = await repos.webhooks.endpoint(projectId, d.endpointId);
    if (!endpoint || endpoint.status !== 'active') throw conflict('ENDPOINT_DISABLED', 'Enable the endpoint first; it is disabled.');
    const now = deps.clock.now();
    await repos.webhooks.updateDelivery(d.id, { status: 'pending', attempts: 0, nextAttemptAt: now, lastError: null, lastStatusCode: null, deliveredAt: null });
    await deps.queue.send(WEBHOOK_QUEUE, { v: 1, delivery_id: d.id }, { tx });
    return deliveryPayload({ ...d, status: 'pending', attempts: 0, nextAttemptAt: now, lastError: null, lastStatusCode: null, deliveredAt: null });
  });
}
