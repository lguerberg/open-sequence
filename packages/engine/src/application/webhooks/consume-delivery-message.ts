/**
 * One queue message, one delivery attempt. A `retry` releases the message with the schedule's
 * delay; every other outcome is final for this message (the tables say what happens next: a
 * `waiting` delivery is enqueued again by its predecessor, a `busy` one belongs to another worker).
 */
import type { QueueMessage } from '@opensequence/core';
import type { Deps } from '../deps.js';
import { deliverWebhook } from './deliver-webhook.js';

export async function consumeDeliveryMessage(deps: Deps, message: QueueMessage): Promise<void> {
  const payload = message.payload as { v?: number; delivery_id?: string } | null;
  if (!payload?.delivery_id || (payload.v ?? 1) > 1) {
    await deps.queue.archive(message.id, 'unknown payload');
    return;
  }
  const result = await deliverWebhook(deps, payload.delivery_id);
  if (result.outcome === 'retry') {
    await deps.queue.release(message.id, result.delayMs);
    return;
  }
  await deps.queue.delete(message.id);
}
