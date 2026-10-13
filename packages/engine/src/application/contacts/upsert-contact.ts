import type { Contact } from '../../domain/entities.js';
import { invalid } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { zodProblems } from '../projects/shared.js';
import { contactInputSchema, type ContactInput } from './shared.js';

/** Create or update by the client's id. `attrs` is deep-merged; SMS consent is never touched here (it has its own admin use case). */
export async function upsertContact(deps: Deps, projectId: string, externalId: string, input: ContactInput): Promise<Contact> {
  const parsed = contactInputSchema.safeParse(input);
  if (!parsed.success) throw invalid('INVALID_CONTACT', zodProblems(parsed.error));
  const d = parsed.data;
  return deps.uow.transaction(async ({ repos }) => {
    const existing = await repos.contacts.byExternalId(projectId, externalId);
    return repos.contacts.upsertByExternalId(
      {
        id: existing?.id ?? deps.ids.next('contact'),
        projectId,
        externalId,
        firstName: d.first_name ?? existing?.firstName ?? null,
        lastName: d.last_name ?? existing?.lastName ?? null,
        email: d.email ?? existing?.email ?? null,
        phone: d.phone ?? existing?.phone ?? null,
        linkedinUrl: d.linkedin_url ?? existing?.linkedinUrl ?? null,
        country: d.country ?? existing?.country ?? null,
        timezone: d.timezone ?? existing?.timezone ?? null,
        smsConsent: existing?.smsConsent ?? false,
        smsConsentAt: existing?.smsConsentAt ?? null,
        smsConsentSource: existing?.smsConsentSource ?? null,
        attrs: d.attrs ?? {},
      },
      true
    );
  });
}
