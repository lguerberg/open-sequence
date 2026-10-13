import { notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { endpointPayload, newSecret } from './shared.js';

/**
 * Replaces the signing secret and returns the new one once. Deliveries signed from this moment use
 * it; the schema keeps one secret per endpoint, so there is no overlap window (a receiver should
 * switch secrets at the same time it reads the response).
 */
export async function rotateSecret(deps: Deps, projectId: string, endpointId: string): Promise<{ endpoint: Record<string, unknown>; secret: string }> {
  const secret = newSecret();
  const { ciphertext, keyId } = await deps.secrets.encrypt(secret);
  return deps.uow.transaction(async ({ repos }) => {
    const existing = await repos.webhooks.endpoint(projectId, endpointId);
    if (!existing) throw notFound('Webhook endpoint', endpointId);
    const updated = await repos.webhooks.updateEndpoint(existing.id, { secretEnc: ciphertext, keyId });
    deps.log.info({ projectId, endpointId }, 'webhook secret rotated');
    return { endpoint: endpointPayload(updated), secret };
  });
}
