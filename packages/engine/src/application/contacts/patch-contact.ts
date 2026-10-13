import type { Contact } from '../../domain/entities.js';
import { invalid } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { zodProblems } from '../projects/shared.js';
import { resolveContact } from './resolve-contact.js';
import { contactInputSchema, type ContactInput } from './shared.js';

/** Changing `attrs` is how a client keeps conditions fresh. */
export async function patchContact(deps: Deps, projectId: string, idOrExternal: string, input: ContactInput): Promise<Contact> {
  const parsed = contactInputSchema.safeParse(input);
  if (!parsed.success) throw invalid('INVALID_CONTACT', zodProblems(parsed.error));
  const d = parsed.data;
  const c = await resolveContact(deps, projectId, idOrExternal);
  const patch: Parameters<typeof deps.uow.repos.contacts.patch>[2] = {};
  if (d.first_name !== undefined) patch.firstName = d.first_name;
  if (d.last_name !== undefined) patch.lastName = d.last_name;
  if (d.email !== undefined) patch.email = d.email;
  if (d.phone !== undefined) patch.phone = d.phone;
  if (d.linkedin_url !== undefined) patch.linkedinUrl = d.linkedin_url;
  if (d.country !== undefined) patch.country = d.country;
  if (d.timezone !== undefined) patch.timezone = d.timezone;
  if (d.attrs !== undefined) patch.attrs = d.attrs;
  return deps.uow.repos.contacts.patch(projectId, c.id, patch, true);
}
