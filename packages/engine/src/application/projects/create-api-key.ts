import type { ApiKey, Scope } from '../../domain/entities.js';
import { invalid, notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { hashApiKey, newApiKeySecret, SCOPES } from './shared.js';

export async function createApiKey(deps: Deps, input: { projectId: string; name: string; scopes: string[] }): Promise<{ key: ApiKey; secret: string }> {
  const scopes = [...new Set(input.scopes)];
  const bad = scopes.filter((s) => !SCOPES.includes(s as Scope));
  if (bad.length) throw invalid('BAD_SCOPE', `Unknown scope: ${bad.join(', ')}. Use read, enroll or admin.`);
  if (scopes.length === 0) throw invalid('BAD_SCOPE', 'A key needs at least one scope.');
  return deps.uow.transaction(async ({ repos }) => {
    if (!(await repos.projects.byId(input.projectId))) throw notFound('Project', input.projectId);
    const secret = newApiKeySecret();
    const key = await repos.projects.createApiKey({
      id: deps.ids.next('apiKey'),
      projectId: input.projectId,
      name: input.name,
      keyHash: hashApiKey(secret),
      prefix: secret.slice(0, 12),
      scopes,
    });
    return { key, secret };
  });
}
