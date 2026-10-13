import type { Sender } from '../../domain/entities.js';
import { invalid } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { zodProblems } from '../projects/shared.js';
import { senderInputSchema, type SenderInput } from './shared.js';

export async function upsertSender(deps: Deps, projectId: string, externalId: string, input: SenderInput): Promise<Sender> {
  const parsed = senderInputSchema.safeParse(input);
  if (!parsed.success) throw invalid('INVALID_SENDER', zodProblems(parsed.error));
  const d = parsed.data;
  return deps.uow.transaction(async ({ repos }) => {
    const existing = await repos.senders.byExternalId(projectId, externalId);
    return repos.senders.upsertByExternalId({
      id: existing?.id ?? deps.ids.next('sender'),
      projectId,
      externalId,
      name: d.name,
      email: d.email ?? null,
      timezone: d.timezone,
      status: existing?.status ?? 'active',
      attrs: d.attrs,
    });
  });
}
