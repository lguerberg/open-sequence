/**
 * Queue consumers: one small loop per queue, `SEQ_CONCURRENCY` messages in flight each, short
 * poll with backoff when empty. Visibility timeouts, not locks, arbitrate between replicas.
 */
import { consumeDeliveryMessage, consumeStepMessage, processSignal, type Deps } from '@opensequence/engine';
import type { QueueMessage } from '@opensequence/core';
import { registry } from '@opensequence/core';

export interface ConsumerSpec {
  queue: string;
  visibilityTimeoutMs: number;
  handle: (deps: Deps, message: QueueMessage) => Promise<void>;
}

async function consumeSignal(deps: Deps, message: QueueMessage): Promise<void> {
  const payload = message.payload as { v?: number; signal_id?: string };
  if (!payload?.signal_id) return deps.queue.archive(message.id, 'unknown payload');
  try {
    await processSignal(deps, payload.signal_id);
    await deps.queue.delete(message.id);
  } catch (err) {
    deps.log.error({ err, signalId: payload.signal_id, attempt: message.readCount }, 'signal processing failed');
    if (message.readCount >= 10) await deps.queue.archive(message.id, 'max reads');
    else await deps.queue.release(message.id, Math.min(60_000 * message.readCount, 10 * 60_000));
  }
}

export function consumerSpecs(): ConsumerSpec[] {
  const channelQueues = [...registry.channels.values()].map((c) => c.queue);
  return [
    ...channelQueues.map((queue) => ({ queue, visibilityTimeoutMs: 120_000, handle: consumeStepMessage })),
    { queue: 'seq_signals', visibilityTimeoutMs: 60_000, handle: consumeSignal },
    { queue: 'seq_webhooks', visibilityTimeoutMs: 30_000, handle: consumeDeliveryMessage },
  ];
}

export interface ConsumerHandle {
  stop(): Promise<void>;
}

export function startConsumer(deps: Deps, spec: ConsumerSpec, concurrency: number): ConsumerHandle {
  let stopping = false;
  let inFlight = 0;
  let idleMs = 250;

  const loop = async () => {
    while (!stopping) {
      try {
        const want = Math.max(1, concurrency - inFlight);
        const messages = await deps.queue.read(spec.queue, { visibilityTimeoutMs: spec.visibilityTimeoutMs, count: want });
        if (messages.length === 0) {
          await sleep(idleMs);
          idleMs = Math.min(idleMs * 2, 5_000);
          continue;
        }
        idleMs = 250;
        await Promise.all(
          messages.map(async (m) => {
            inFlight++;
            try {
              await spec.handle(deps, m);
            } catch (err) {
              deps.log.error({ err, queue: spec.queue, id: m.id }, 'consumer handler threw');
              await deps.queue.release(m.id, 60_000).catch(() => {});
            } finally {
              inFlight--;
            }
          })
        );
      } catch (err) {
        deps.log.error({ err, queue: spec.queue }, 'consumer loop error');
        await sleep(2_000);
      }
    }
  };
  const done = loop();

  return {
    async stop() {
      stopping = true;
      const deadline = Date.now() + 30_000;
      while (inFlight > 0 && Date.now() < deadline) await sleep(100);
      await done;
    },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
