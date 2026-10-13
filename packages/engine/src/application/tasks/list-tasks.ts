import type { Task } from '../../domain/entities.js';
import type { ListOptions, Page } from '../../domain/repositories.js';
import type { Deps } from '../deps.js';

export interface TaskFilter {
  senderId?: string;
  status?: string;
  kind?: string;
  contactId?: string;
}

export async function listTasks(deps: Deps, projectId: string, filter: TaskFilter, opts: ListOptions): Promise<Page<Task>> {
  return deps.uow.repos.tasks.list(projectId, filter, opts);
}
