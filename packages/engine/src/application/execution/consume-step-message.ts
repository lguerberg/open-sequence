/**
 * One queue message, one step. The message's read count is the attempt number; a `retry` outcome
 * releases the message with backoff, anything else deletes it. A message whose run no longer
 * exists or is no longer running is simply dropped (the tables are the truth).
 */
import type { QueueMessage } from '@opensequence/core';
import type { Deps } from '../deps.js';
import { executeEmailStep, type StepOutcome } from './execute-email-step.js';
import { executeSmsStep } from './execute-sms-step.js';

export type StepExecutor = (deps: Deps, runId: string, attempt: number) => Promise<StepOutcome>;

/** Executors by queue name; a module registers its own here (docs section 20). */
export const executors = new Map<string, StepExecutor>([
  ['seq_email', executeEmailStep],
  ['seq_sms', executeSmsStep],
]);

export function backoffMs(attempt: number): number {
  const base = Math.min(60_000 * 2 ** (attempt - 1), 30 * 60_000);
  return base + Math.floor(Math.random() * 15_000);
}

export async function consumeStepMessage(deps: Deps, message: QueueMessage): Promise<void> {
  const payload = message.payload as { v?: number; run_id?: string };
  const executor = executors.get(message.queue);
  if (!executor || !payload?.run_id || (payload.v ?? 1) > 1) {
    await deps.queue.archive(message.id, 'unknown queue or payload');
    return;
  }
  const outcome = await executor(deps, payload.run_id, message.readCount);
  if (outcome === 'retry') {
    if (message.readCount >= deps.config.maxReads) {
      await deps.queue.archive(message.id, 'max reads');
      return;
    }
    await deps.queue.release(message.id, backoffMs(message.readCount));
    return;
  }
  await deps.queue.delete(message.id);
}
