import type { Enrollment } from '../../domain/entities.js';
import { invalid } from '../../domain/shared/errors.js';
import { externalIdOf } from '../../infrastructure/ids.js';
import type { Deps } from '../deps.js';
import { MAX_BATCH } from './shared.js';

export interface ContactStatus {
  contact: { id: string; external_id: string };
  enrollment: Pick<Enrollment, 'id' | 'sequenceId' | 'versionId' | 'senderId' | 'status' | 'currentNodeId'> | null;
}

/** For "in a sequence" badges in a list: each contact's active enrollment, or null. */
export async function contactStatuses(deps: Deps, projectId: string, idsOrExternal: string[]): Promise<ContactStatus[]> {
  if (idsOrExternal.length > MAX_BATCH) throw invalid('BATCH_TOO_LARGE', `At most ${MAX_BATCH} contacts per call.`);
  const repos = deps.uow.repos;
  const serviceIds = idsOrExternal.filter((x) => externalIdOf(x) === null);
  const externals = idsOrExternal.map(externalIdOf).filter((x): x is string => x !== null);
  const found = [...(await repos.contacts.byIds(projectId, serviceIds)), ...(await repos.contacts.byExternalIds(projectId, externals))];
  const active = await repos.enrollments.activeByContacts(projectId, found.map((c) => c.id));
  const byContact = new Map(active.map((e) => [e.contactId, e]));
  const out: ContactStatus[] = [];
  for (const c of found) {
    const brief = byContact.get(c.id);
    const e = brief ? await repos.enrollments.byId(brief.enrollmentId) : null;
    out.push({
      contact: { id: c.id, external_id: c.externalId },
      enrollment: e ? { id: e.id, sequenceId: e.sequenceId, versionId: e.versionId, senderId: e.senderId, status: e.status, currentNodeId: e.currentNodeId } : null,
    });
  }
  return out;
}
