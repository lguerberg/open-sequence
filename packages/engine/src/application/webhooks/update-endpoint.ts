import { invalid, notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { zodProblems } from '../projects/shared.js';
import { endpointPatchSchema, endpointPayload, normalizeEventTypes, unsafeUrlReason, type EndpointPatch } from './shared.js';

/** Changes the URL or the subscribed events; the status is changed by enable, and the secret by rotate. */
export async function updateEndpoint(deps: Deps, projectId: string, endpointId: string, input: EndpointPatch): Promise<Record<string, unknown>> {
  const parsed = endpointPatchSchema.safeParse(input);
  if (!parsed.success) throw invalid('VALIDATION', zodProblems(parsed.error));
  const patch: { url?: string; eventTypes?: string[] } = {};
  if (parsed.data.url !== undefined) {
    const reason = await unsafeUrlReason(parsed.data.url);
    if (reason) throw invalid('UNSAFE_URL', `The endpoint URL ${reason}.`);
    patch.url = parsed.data.url;
  }
  if (parsed.data.event_types !== undefined) patch.eventTypes = normalizeEventTypes(parsed.data.event_types);
  return deps.uow.transaction(async ({ repos }) => {
    const existing = await repos.webhooks.endpoint(projectId, endpointId);
    if (!existing) throw notFound('Webhook endpoint', endpointId);
    const updated = Object.keys(patch).length ? await repos.webhooks.updateEndpoint(existing.id, patch) : existing;
    return endpointPayload(updated);
  });
}
