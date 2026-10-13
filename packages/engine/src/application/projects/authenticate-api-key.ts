import type { Scope } from '../../domain/entities.js';
import type { Deps } from '../deps.js';
import { hashApiKey, type AuthenticatedKey } from './shared.js';

/** Resolves a bearer key to its project and scopes; null when unknown or revoked. */
export async function authenticateApiKey(deps: Deps, bearer: string): Promise<AuthenticatedKey | null> {
  const key = await deps.uow.repos.projects.apiKeyByHash(hashApiKey(bearer));
  if (!key || key.revokedAt) return null;
  // Best effort and outside any transaction: never blocks a request.
  deps.uow.repos.projects.touchApiKey(key.id, deps.clock.now()).catch(() => {});
  return { projectId: key.projectId, keyId: key.id, scopes: key.scopes as Scope[] };
}
