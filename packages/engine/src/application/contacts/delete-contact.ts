import type { Deps } from '../deps.js';
import { resolveContact } from './resolve-contact.js';

/** Erase the contact and everything attached (privacy requests). Active enrollments exit with reason `deleted` first. */
export async function deleteContact(deps: Deps, projectId: string, idOrExternal: string): Promise<void> {
  const c = await resolveContact(deps, projectId, idOrExternal);
  await deps.uow.transaction(async ({ repos, raise }) => {
    const active = await repos.enrollments.activeByContacts(projectId, [c.id]);
    for (const e of active) {
      await repos.enrollments.update(e.enrollmentId, { status: 'exited', exitReason: 'deleted', finishedAt: deps.clock.now(), nextRunAt: null, ownerRunId: null, waiting: null });
      raise({
        type: 'enrollment.exited',
        projectId,
        enrollmentId: e.enrollmentId,
        payload: { enrollment: e.enrollmentId, contact: { id: c.id, external_id: c.externalId }, exit_reason: 'deleted' },
      });
    }
    await repos.contacts.delete(projectId, c.id);
  });
}
