/** The delivery sweep: pending deliveries due over two minutes ago get a fresh message (lost message, or waiting on an earlier one). */
import type { Deps } from '../deps.js';
import { MINUTE_MS, requeueDueDeliveries } from './shared.js';

export async function webhooksTick(deps: Deps): Promise<{ requeuedDeliveries: number }> {
  const now = deps.clock.now();
  return { requeuedDeliveries: await requeueDueDeliveries(deps, new Date(now.getTime() - 2 * MINUTE_MS), 500) };
}
