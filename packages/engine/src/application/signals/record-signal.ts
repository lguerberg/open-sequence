/**
 * Every producer (provider webhooks, the poll job, the client events endpoint, task completion)
 * records a signal through here: one row, idempotent on (project, source, external_id), and one
 * queue message in the same transaction so the processor picks it up (docs section 7.5).
 */
import type { Signal, SignalKind } from '../../domain/entities.js';
import type { TransactionScope } from '../../domain/repositories.js';
import type { Deps } from '../deps.js';

export const SIGNAL_QUEUE = 'seq_signals';

export interface RecordSignalInput {
  projectId: string;
  contactId: string;
  kind: SignalKind;
  channel: string | null;
  source: string;
  externalId: string;
  occurredAt: Date;
  payload?: Record<string, unknown>;
}

export async function recordSignal(deps: Deps, scope: TransactionScope, input: RecordSignalInput): Promise<{ signal: Signal; created: boolean }> {
  const out = await scope.repos.signals.insertIfNew({
    id: deps.ids.next('signal'),
    projectId: input.projectId,
    contactId: input.contactId,
    kind: input.kind,
    channel: input.channel,
    source: input.source,
    externalId: input.externalId,
    occurredAt: input.occurredAt,
    payload: input.payload ?? {},
  });
  if (out.created) await deps.queue.send(SIGNAL_QUEUE, { v: 1, signal_id: out.signal.id }, { tx: scope.tx });
  return out;
}
