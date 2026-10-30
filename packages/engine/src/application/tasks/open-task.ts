/**
 * The sender opened a task: its link (a LinkedIn profile, a page to read) is on their screen. The
 * first open is recorded. A task whose step says opening means doing it (`complete_on_open`, which
 * every LinkedIn task carries, as "sent") completes there with that outcome, so the sender never
 * marks it by hand. Opening a task that is no longer open returns it unchanged.
 */
import type { Task } from '../../domain/entities.js';
import { notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { completeTask } from './complete-task.js';

export async function openTask(deps: Deps, projectId: string, taskId: string): Promise<Task> {
  const opened = await deps.uow.transaction(async ({ repos }) => {
    const t = await repos.tasks.lock(taskId);
    if (!t || t.projectId !== projectId) throw notFound('Task', taskId);
    if (t.openedAt) return t;
    return repos.tasks.update(t.id, { openedAt: deps.clock.now() });
  });
  if (opened.status !== 'open' || !opened.completeOnOpen) return opened;
  return completeTask(deps, projectId, opened.id, { outcome: opened.completeOnOpen }, 'client');
}
