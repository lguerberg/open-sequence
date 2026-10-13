import type { Contact } from '../../domain/entities.js';
import { notFound } from '../../domain/shared/errors.js';
import { externalIdOf } from '../../infrastructure/ids.js';
import type { Deps } from '../deps.js';

export async function resolveContact(deps: Deps, projectId: string, idOrExternal: string): Promise<Contact> {
  const repos = deps.uow.repos;
  const ext = externalIdOf(idOrExternal);
  const c = ext === null ? await repos.contacts.byId(projectId, idOrExternal) : await repos.contacts.byExternalId(projectId, ext);
  if (!c) throw notFound('Contact', idOrExternal);
  return c;
}
