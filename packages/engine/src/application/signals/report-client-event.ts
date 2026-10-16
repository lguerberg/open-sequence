/**
 * POST /v1/contacts/{id}/events (docs 10.4): the client reports what the service cannot see, a
 * meeting booked elsewhere, a do-not-contact flag, a reply seen in another tool. The event enters
 * the same signal table as everything else; `id` makes a retry a no-op.
 */
import { z } from 'zod';
import type { Signal, SignalKind } from '../../domain/entities.js';
import { invalid } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { resolveContact } from '../contacts/resolve-contact.js';
import { zodProblems } from '../projects/shared.js';
import { recordSignal } from './record-signal.js';

export const clientEventSchema = z
  .object({
    id: z.string().min(1).max(200),
    type: z.enum(['meeting_booked', 'opt_out', 'suppressed', 'reply']),
    occurred_at: z.coerce.date().optional(),
    channel: z.enum(['email', 'sms', 'all']).optional(),
    reason: z.string().max(200).optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type ClientEventInput = z.input<typeof clientEventSchema>;

const KINDS: Record<z.infer<typeof clientEventSchema>['type'], SignalKind> = {
  meeting_booked: 'meeting_booked',
  opt_out: 'opt_out',
  suppressed: 'contact_suppressed',
  reply: 'reply',
};

export async function reportClientEvent(deps: Deps, projectId: string, contactIdOrExternal: string, raw: unknown): Promise<{ signal: Signal; created: boolean }> {
  const parsed = clientEventSchema.safeParse(raw);
  if (!parsed.success) throw invalid('INVALID_EVENT', `The event is not valid: ${zodProblems(parsed.error)}`);
  const input = parsed.data;
  const contact = await resolveContact(deps, projectId, contactIdOrExternal);
  const payload: Record<string, unknown> = { ...(input.data ?? {}) };
  if (input.reason !== undefined) payload['reason'] = input.reason;
  return deps.uow.transaction((scope) =>
    recordSignal(deps, scope, {
      projectId,
      contactId: contact.id,
      kind: KINDS[input.type],
      channel: input.channel ?? (input.type === 'opt_out' ? 'all' : null),
      source: 'client',
      externalId: input.id,
      occurredAt: input.occurred_at ?? deps.clock.now(),
      payload,
    })
  );
}
