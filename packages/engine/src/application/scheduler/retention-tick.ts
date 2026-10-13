/** Daily pruning of what has served its purpose: idempotency keys after a day, dead-queue rows and delivered webhooks after 30 days. */
import type { Deps } from '../deps.js';
import { DAY_MS } from './shared.js';

export async function retentionTick(deps: Deps): Promise<{ idempotencyKeys: number; deadQueue: number; deliveries: number }> {
  const now = deps.clock.now().getTime();
  return deps.uow.repos.scheduler.purge({
    idempotencyBefore: new Date(now - DAY_MS),
    deadQueueBefore: new Date(now - 30 * DAY_MS),
    deliveredBefore: new Date(now - 30 * DAY_MS),
  });
}
