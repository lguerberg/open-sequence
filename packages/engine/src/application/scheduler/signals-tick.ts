/** The signal sweep: a signal recorded over two minutes ago and still unprocessed lost its message; send another. */
import type { Deps } from '../deps.js';
import { MINUTE_MS, SIGNAL_QUEUE } from './shared.js';

export async function signalsTick(deps: Deps): Promise<{ requeuedSignals: number }> {
  const now = deps.clock.now();
  const stale = await deps.uow.repos.signals.unprocessed(new Date(now.getTime() - 2 * MINUTE_MS), 200);
  for (const s of stale) await deps.queue.send(SIGNAL_QUEUE, { v: 1, signal_id: s.id });
  return { requeuedSignals: stale.length };
}
