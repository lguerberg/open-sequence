import { notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { WEBHOOK_QUEUE } from './shared.js';

/** Re-sends every delivery that failed for good since a time (docs section 9.2, "Replayable"). */
export async function recoverEndpoint(deps: Deps, projectId: string, endpointId: string, input: { since: Date }): Promise<{ replayed: number }> {
  return deps.uow.transaction(async ({ repos, tx }) => {
    if (!(await repos.webhooks.endpoint(projectId, endpointId))) throw notFound('Webhook endpoint', endpointId);
    const now = deps.clock.now();
    const failed = await repos.webhooks.failedSince(endpointId, input.since);
    for (const d of failed) {
      await repos.webhooks.updateDelivery(d.id, { status: 'pending', attempts: 0, nextAttemptAt: now, lastError: null });
      await deps.queue.send(WEBHOOK_QUEUE, { v: 1, delivery_id: d.id }, { tx });
    }
    deps.log.info({ projectId, endpointId, replayed: failed.length, since: input.since.toISOString() }, 'webhook endpoint recovered');
    return { replayed: failed.length };
  });
}
