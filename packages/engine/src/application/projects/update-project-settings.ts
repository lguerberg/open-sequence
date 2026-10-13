import type { Project } from '../../domain/entities.js';
import { invalid, notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { projectSettingsSchema, zodProblems } from './shared.js';

export async function updateProjectSettings(deps: Deps, projectId: string, patch: unknown): Promise<Project> {
  const parsed = projectSettingsSchema.safeParse(patch);
  if (!parsed.success) throw invalid('INVALID_SETTINGS', zodProblems(parsed.error));
  return deps.uow.transaction(async ({ repos }) => {
    const project = await repos.projects.byId(projectId);
    if (!project) throw notFound('Project', projectId);
    return repos.projects.updateSettings(projectId, { ...project.settings, ...parsed.data });
  });
}
