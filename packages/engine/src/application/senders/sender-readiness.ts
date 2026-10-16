import type { SenderChannel } from '../../domain/entities.js';
import type { Deps } from '../deps.js';

export interface ChannelReadiness {
  ok: boolean;
  reason?: string;
}

export interface Readiness {
  email: ChannelReadiness;
  sms: ChannelReadiness;
  task: { ok: true };
}

/** Which node types this sender can run, and why not (`google_not_connected`, `no_allo_number`, `email_credentials_needed`). */
export async function senderReadiness(deps: Deps, senderId: string): Promise<Readiness> {
  const channels = await deps.uow.repos.senders.channels(senderId);
  const by = (c: string) => channels.find((x) => x.channel === c);
  const state = (c: SenderChannel | undefined, missing: string): ChannelReadiness => {
    if (!c) return { ok: false, reason: missing };
    if (c.status === 'active') return { ok: true };
    return { ok: false, reason: `${c.channel}_${c.status}` };
  };
  return {
    email: state(by('email'), 'google_not_connected'),
    sms: state(by('sms'), 'no_allo_number'),
    task: { ok: true },
  };
}
