import type { Task } from '../../domain/entities.js';
import { notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';

export async function getTask(deps: Deps, projectId: string, taskId: string): Promise<Task> {
  const t = await deps.uow.repos.tasks.byId(projectId, taskId);
  if (!t) throw notFound('Task', taskId);
  return t;
}
