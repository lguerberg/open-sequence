import type { Contact, Enrollment, Run, Signal } from '../../domain/entities.js';
import type { Repositories } from '../../domain/repositories.js';

export interface Credit {
  runId: string | null;
  attribution: 'direct' | 'assisted';
}

/** A reply, a connected call and a booking are the only signals that earn credit (docs 11.1). */
export const REPLY_KINDS: readonly string[] = ['reply', 'call_connected'];

/**
 * Attribution (docs 11.2). Decides whether `enrollment` is the one this signal credits, and to which
 * run: a reply goes to the latest same-channel touch before it (direct), else the latest touch of
 * any channel (assisted); a connected call goes to its task's own run; a meeting goes to the most
 * recently touched candidate, even one that already exited. Null means another enrollment (or none)
 * gets the credit.
 */
export async function attributeSignal(repos: Repositories, signal: Signal, enrollment: Enrollment, candidates: Enrollment[]): Promise<Credit | null> {
  const own = (run: Run | null): run is Run => !!run && run.enrollmentId === enrollment.id;
  switch (signal.kind) {
    case 'reply': {
      const direct = await repos.runs.latestTouch(signal.contactId, signal.channel, signal.occurredAt);
      if (direct) return own(direct) ? { runId: direct.id, attribution: 'direct' } : null;
      const assisted = await repos.runs.latestTouch(signal.contactId, null, signal.occurredAt);
      return own(assisted) ? { runId: assisted.id, attribution: 'assisted' } : null;
    }
    case 'call_connected': {
      const runId = typeof signal.payload['run_id'] === 'string' ? signal.payload['run_id'] : null;
      const run = runId ? await repos.runs.byId(runId) : null;
      return own(run) ? { runId: run.id, attribution: 'direct' } : null;
    }
    case 'meeting_booked': {
      const touched = candidates.filter((c) => c.lastTouchAt !== null).sort((a, b) => b.lastTouchAt!.getTime() - a.lastTouchAt!.getTime());
      if (touched[0]?.id !== enrollment.id) return null;
      const run = await repos.runs.latestTouch(signal.contactId, null, signal.occurredAt);
      return { runId: own(run) ? run.id : null, attribution: 'direct' };
    }
    default:
      return null;
  }
}

/** The wait_for / task event names a signal can wake, in the order they are tried. */
export function wakeEventNames(signal: Signal): string[] {
  switch (signal.kind) {
    case 'reply':
      return signal.channel ? ['reply', `reply:${signal.channel}`] : ['reply'];
    case 'call_connected':
      return ['call_connected', 'reply'];
    case 'meeting_booked':
      return ['meeting_booked'];
    default:
      return [];
  }
}

/** Opt-out, hard bounce, complaint and suppression end an enrollment whatever the definition says. */
export function builtInExitReason(signal: Signal): string | null {
  switch (signal.kind) {
    case 'opt_out':
      return 'opt_out';
    case 'bounce':
      return signal.payload['hard'] === false ? null : 'bounced';
    case 'complaint':
      return 'bounced';
    case 'contact_suppressed':
      return 'suppressed';
    default:
      return null;
  }
}

/** The definition's own exit choice: `exit_on` lists `reply` (a connected call counts) and `meeting_booked`. */
export function chosenExitReason(signal: Signal, exitOn: readonly string[]): string | null {
  if (REPLY_KINDS.includes(signal.kind) && exitOn.includes('reply')) return 'replied';
  if (signal.kind === 'meeting_booked' && exitOn.includes('meeting_booked')) return 'meeting_booked';
  return null;
}

export function signalPayload(s: Signal): Record<string, unknown> {
  return {
    id: s.id,
    kind: s.kind,
    channel: s.channel,
    source: s.source,
    occurred_at: s.occurredAt.toISOString(),
    attribution: s.attribution,
    attributed_run: s.attributedRunId,
  };
}

export function contactPayload(c: Contact): Record<string, unknown> {
  return { id: c.id, external_id: c.externalId, email: c.email, phone: c.phone, first_name: c.firstName, last_name: c.lastName };
}
