import { invalid } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';

/** A project kill switch: "global" or "channel:<name>". Read by the planner and every executor, no deploy needed. */
export async function setFlag(deps: Deps, projectId: string, key: string, value: boolean, by: string | null): Promise<void> {
  if (!/^(global|channel:[a-z_]+)$/.test(key)) throw invalid('BAD_FLAG', 'A flag is "global" or "channel:<name>".');
  await deps.uow.repos.projects.setFlag(projectId, key, value, by);
}
