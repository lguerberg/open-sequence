import type { Contact } from '../../domain/entities.js';
import { invalid } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { MAX_BATCH, type ContactInput } from './shared.js';
import { upsertContact } from './upsert-contact.js';

export async function upsertContacts(deps: Deps, projectId: string, items: Array<{ external_id: string } & ContactInput>): Promise<Contact[]> {
  if (items.length > MAX_BATCH) throw invalid('BATCH_TOO_LARGE', `At most ${MAX_BATCH} contacts per call.`);
  const out: Contact[] = [];
  for (const { external_id, ...rest } of items) out.push(await upsertContact(deps, projectId, external_id, rest));
  return out;
}
