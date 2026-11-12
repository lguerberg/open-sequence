import type { Contact } from '../../domain/entities.js';
import type { Deps } from '../deps.js';
import { resolveContact } from './resolve-contact.js';

/** Admin scope only: consent is the one contact field an enroll key can never set. */
export async function setOutreachConsent(deps: Deps, projectId: string, idOrExternal: string, input: { consent: boolean; source?: string; at?: Date }): Promise<Contact> {
  const c = await resolveContact(deps, projectId, idOrExternal);
  return deps.uow.repos.contacts.patch(
    projectId,
    c.id,
    { outreachConsent: input.consent, outreachConsentAt: input.consent ? (input.at ?? deps.clock.now()) : null, outreachConsentSource: input.source ?? null },
    false
  );
}
