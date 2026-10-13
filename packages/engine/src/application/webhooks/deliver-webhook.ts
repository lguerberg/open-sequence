/**
 * One delivery attempt (docs section 9.2). The delivery row is locked for the whole attempt, so two
 * workers holding duplicate messages cannot post twice; the second sees `busy`. Deliveries for the
 * same endpoint and enrollment go one at a time in creation order: a later one returns `waiting`
 * and is enqueued again by the earlier one when it succeeds (or by the sweep when it gives up).
 *
 * The caller (the queue consumer) owns the message: it releases it with the returned delay on
 * `retry` and deletes it on every other outcome.
 */
import type { Deps } from '../deps.js';
import { BACKOFF_MS, DELIVERY_TIMEOUT_MS, DISABLE_AFTER_MS, endpointPayload, isSafeUrl, signedHeaders, WEBHOOK_QUEUE } from './shared.js';

export type DeliveryOutcome = { outcome: 'delivered' | 'busy' | 'skipped' | 'waiting' | 'failed' | 'disabled' } | { outcome: 'retry'; delayMs: number };

export async function deliverWebhook(deps: Deps, deliveryId: string): Promise<DeliveryOutcome> {
  return deps.uow.transaction(async (scope): Promise<DeliveryOutcome> => {
    const { repos } = scope;
    const d = await repos.webhooks.lockDelivery(deliveryId);
    if (!d) return { outcome: (await repos.webhooks.delivery(deliveryId)) ? 'busy' : 'skipped' };
    if (d.status !== 'pending') return { outcome: 'skipped' };

    const endpoint = await repos.webhooks.endpoint(d.projectId, d.endpointId);
    if (!endpoint || endpoint.status !== 'active') {
      await repos.webhooks.updateDelivery(d.id, { status: 'disabled', nextAttemptAt: null });
      return { outcome: 'disabled' };
    }
    if (d.enrollmentId && (await repos.webhooks.hasEarlierPending(endpoint.id, d.enrollmentId, d.createdAt))) return { outcome: 'waiting' };

    const now = deps.clock.now();
    const body = JSON.stringify(d.payload);
    let secret: string;
    try {
      secret = await deps.secrets.decrypt(endpoint.secretEnc, endpoint.keyId);
    } catch (err) {
      // The signing key is gone (SEQ_ENCRYPTION_KEYS changed): retrying cannot help. Disable the
      // endpoint and say so; `rotate-secret` re-encrypts under the current key and `enable` resumes.
      const reason = `The signing secret cannot be decrypted (${err instanceof Error ? err.message : String(err)}). Rotate the secret, then enable the endpoint.`;
      const disabled = await repos.webhooks.updateEndpoint(endpoint.id, { status: 'disabled', disabledReason: reason, disabledAt: now });
      await repos.webhooks.updateDelivery(d.id, { status: 'disabled', nextAttemptAt: null, lastError: reason });
      scope.raise({ type: 'endpoint.disabled', projectId: d.projectId, payload: { endpoint: endpointPayload(disabled), reason } });
      deps.log.error({ projectId: d.projectId, endpointId: endpoint.id, deliveryId: d.id, keyId: endpoint.keyId }, 'webhook endpoint disabled: secret cannot be decrypted');
      return { outcome: 'disabled' };
    }
    const headers = signedHeaders(secret, d.eventId, now, body);
    // Re-resolved at every attempt: a DNS record can change after the endpoint was registered.
    const res = (await isSafeUrl(endpoint.url))
      ? await deps.webhookTransport.post(endpoint.url, body, headers, DELIVERY_TIMEOUT_MS).catch((err: unknown) => ({ status: 0, error: err instanceof Error ? err.message : String(err) }))
      : { status: 0, error: 'the URL no longer resolves to a public https address' };
    const attempts = d.attempts + 1;
    const log = { projectId: d.projectId, endpointId: endpoint.id, deliveryId: d.id, eventType: d.eventType, attempts, status: res.status };

    if (res.status >= 200 && res.status < 300) {
      await repos.webhooks.updateDelivery(d.id, { status: 'delivered', attempts, lastStatusCode: res.status, lastError: null, nextAttemptAt: null, deliveredAt: now });
      if (d.enrollmentId) {
        const next = await repos.webhooks.oldestPending(endpoint.id, d.enrollmentId);
        if (next) await deps.queue.send(WEBHOOK_QUEUE, { v: 1, delivery_id: next.id }, { tx: scope.tx });
      }
      deps.log.info(log, 'webhook delivered');
      return { outcome: 'delivered' };
    }

    const failure = { attempts, lastStatusCode: res.status > 0 ? res.status : null, lastError: res.error ?? `HTTP ${res.status}` };
    const oldestAge = await repos.webhooks.oldestPendingAge(endpoint.id, now);
    if (oldestAge !== null && oldestAge > DISABLE_AFTER_MS) {
      const reason = `Every delivery has failed for ${Math.round(DISABLE_AFTER_MS / 86_400_000)} days; last error: ${failure.lastError}`;
      const disabled = await repos.webhooks.updateEndpoint(endpoint.id, { status: 'disabled', disabledReason: reason, disabledAt: now });
      await repos.webhooks.updateDelivery(d.id, { ...failure, status: 'disabled', nextAttemptAt: null });
      scope.raise({ type: 'endpoint.disabled', projectId: d.projectId, payload: { endpoint: endpointPayload(disabled), reason } });
      deps.log.warn({ ...log, error: failure.lastError }, 'webhook endpoint disabled');
      return { outcome: 'disabled' };
    }
    const delayMs = BACKOFF_MS[attempts];
    if (delayMs === undefined) {
      await repos.webhooks.updateDelivery(d.id, { ...failure, status: 'failed', nextAttemptAt: null });
      deps.log.warn({ ...log, error: failure.lastError }, 'webhook delivery failed for good');
      return { outcome: 'failed' };
    }
    await repos.webhooks.updateDelivery(d.id, { ...failure, nextAttemptAt: new Date(now.getTime() + delayMs) });
    deps.log.info({ ...log, error: failure.lastError, delayMs }, 'webhook delivery will be retried');
    return { outcome: 'retry', delayMs };
  });
}
