import { notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { endpointPayload, WEBHOOK_QUEUE } from './shared.js';

/** Back to active, and every delivery held while it was disabled goes out again, oldest first. */
export async function enableEndpoint(deps: Deps, projectId: string, endpointId: string): Promise<{ endpoint: Record<string, unknown>; replayed: number }> {
  return deps.uow.transaction(async ({ repos, tx }) => {
    const existing = await repos.webhooks.endpoint(projectId, endpointId);
    if (!existing) throw notFound('Webhook endpoint', endpointId);
    const now = deps.clock.now();
    const endpoint = existing.status === 'active' ? existing : await repos.webhooks.updateEndpoint(existing.id, { status: 'active', disabledReason: null, disabledAt: null });
    const held = await repos.webhooks.heldDeliveries(existing.id);
    for (const d of held) {
      await repos.webhooks.updateDelivery(d.id, { status: 'pending', nextAttemptAt: now });
      await deps.queue.send(WEBHOOK_QUEUE, { v: 1, delivery_id: d.id }, { tx });
    }
    deps.log.info({ projectId, endpointId, replayed: held.length }, 'webhook endpoint enabled');
    return { endpoint: endpointPayload(endpoint), replayed: held.length };
  });
}
