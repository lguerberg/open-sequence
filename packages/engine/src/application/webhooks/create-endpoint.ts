import { invalid, notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { zodProblems } from '../projects/shared.js';
import { endpointInputSchema, endpointPayload, newSecret, normalizeEventTypes, unsafeUrlReason, type EndpointInput } from './shared.js';

/** Registers an endpoint. The secret is returned once, here, and stored encrypted. */
export async function createEndpoint(deps: Deps, projectId: string, input: EndpointInput): Promise<{ endpoint: Record<string, unknown>; secret: string }> {
  const parsed = endpointInputSchema.safeParse(input);
  if (!parsed.success) throw invalid('VALIDATION', zodProblems(parsed.error));
  const eventTypes = normalizeEventTypes(parsed.data.event_types);
  const reason = await unsafeUrlReason(parsed.data.url);
  if (reason) throw invalid('UNSAFE_URL', `The endpoint URL ${reason}.`);
  const secret = newSecret();
  const { ciphertext, keyId } = await deps.secrets.encrypt(secret);
  return deps.uow.transaction(async ({ repos }) => {
    if (!(await repos.projects.byId(projectId))) throw notFound('Project', projectId);
    const endpoint = await repos.webhooks.createEndpoint({
      id: deps.ids.next('webhookEndpoint'),
      projectId,
      url: parsed.data.url,
      secretEnc: ciphertext,
      keyId,
      eventTypes,
      status: 'active',
    });
    deps.log.info({ projectId, endpointId: endpoint.id }, 'webhook endpoint created');
    return { endpoint: endpointPayload(endpoint), secret };
  });
}
