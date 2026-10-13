import type { Sender } from '../../domain/entities.js';
import { notFound } from '../../domain/shared/errors.js';
import { externalIdOf } from '../../infrastructure/ids.js';
import type { Deps } from '../deps.js';

/** `{id}` in a route is a service id or the client's external id (API conventions, section 10). */
export async function resolveSender(deps: Deps, projectId: string, idOrExternal: string): Promise<Sender> {
  const repos = deps.uow.repos;
  const ext = externalIdOf(idOrExternal);
  const sender = ext === null ? await repos.senders.byId(projectId, idOrExternal) : await repos.senders.byExternalId(projectId, ext);
  if (!sender) throw notFound('Sender', idOrExternal);
  return sender;
}
