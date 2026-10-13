/**
 * What the periodic jobs share: queue names for the hints they re-send, and the one sweep two jobs
 * run (due deliveries whose message was lost). Every sweep is idempotent: a duplicate message costs
 * a locked-row check, never a double side effect.
 */
import type { Deps } from '../deps.js';
import { WEBHOOK_QUEUE } from '../webhooks/shared.js';

export { WEBHOOK_QUEUE };
export const SIGNAL_QUEUE = 'seq_signals';

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** Pending deliveries due before `olderThan` get a fresh message; a lag keeps this from racing the consumer. */
export async function requeueDueDeliveries(deps: Deps, olderThan: Date, limit: number): Promise<number> {
  const due = await deps.uow.repos.webhooks.due(olderThan, limit);
  for (const d of due) await deps.queue.send(WEBHOOK_QUEUE, { v: 1, delivery_id: d.id });
  return due.length;
}
