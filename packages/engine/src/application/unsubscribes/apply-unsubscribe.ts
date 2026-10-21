import { DomainError } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { recordSignal } from '../signals/record-signal.js';
import { isEmailSuppressed, readToken, type UnsubscribeStatus } from './shared.js';

/**
 * POST /v1/unsubscribes/{token}, the hosted page's button and RFC 8058 one-click: writes an email
 * suppression now and records an `opt_out` signal, which exits the contact's enrollments with
 * reason `opt_out`. Idempotent: a second call changes nothing and says `already_unsubscribed: true`.
 */
export async function applyUnsubscribe(deps: Deps, token: string, projectId?: string): Promise<UnsubscribeStatus> {
  const read = await readToken(deps, deps.uow.repos, token, projectId);
  if (read.status.expired) throw new DomainError('UNSUBSCRIBE_TOKEN_EXPIRED', 'This unsubscribe link has expired (links last 90 days). Ask the person to reply to the email instead, or report an opt_out with POST /v1/contacts/{id}/events.', 400);
  if (!read.status.valid || !read.claims) throw new DomainError('UNSUBSCRIBE_TOKEN_INVALID', 'This unsubscribe token is not valid: it was not issued by this server for this project, it was altered, or its contact was deleted.', 400);
  const { projectId: project, contactId, runId } = read.claims;
  const now = deps.clock.now();
  const already = await deps.uow.transaction(async (scope) => {
    const before = await isEmailSuppressed(scope.repos, contactId);
    await scope.repos.contacts.suppress(project, contactId, 'email', 'opt_out');
    await recordSignal(deps, scope, { projectId: project, contactId, kind: 'opt_out', channel: 'email', source: 'optout_link', externalId: `optout:${contactId}`, occurredAt: now, payload: { run_id: runId } });
    return before;
  });
  return { ...read.status, already_unsubscribed: already };
}
