import type { Project, ProjectSettings } from '../../domain/entities.js';
import { DomainError, invalid } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { hashApiKey, newApiKeySecret } from './shared.js';

/** Operator only. Creates the project and its first admin key; the key is returned once. */
export async function createProject(deps: Deps, input: { slug: string; name: string; settings?: ProjectSettings }): Promise<{ project: Project; apiKey: string }> {
  const slug = input.slug.toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(slug)) throw invalid('INVALID_SLUG', 'A slug is 3 to 48 lowercase letters, digits and dashes.');
  return deps.uow.transaction(async ({ repos }) => {
    if (await repos.projects.bySlug(slug)) throw new DomainError('SLUG_TAKEN', `The slug "${slug}" is already used.`, 409);
    const project = await repos.projects.create({ id: deps.ids.next('project'), slug, name: input.name, settings: input.settings ?? {} });
    const secret = newApiKeySecret();
    await repos.projects.createApiKey({
      id: deps.ids.next('apiKey'),
      projectId: project.id,
      name: 'default',
      keyHash: hashApiKey(secret),
      prefix: secret.slice(0, 12),
      scopes: ['admin'],
    });
    return { project, apiKey: secret };
  });
}
