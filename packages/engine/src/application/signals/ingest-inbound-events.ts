/**
 * Turns a provider's normalized inbound events (a verified webhook or a poll) into message rows
 * and signals (docs 8.1 and 9.1b). One transaction per event, each idempotent on the provider's
 * id. Mail that does not belong to a thread the service started is ignored outright: the service
 * never stores a sender's private mailbox.
 */
import type { InboundEvent } from '@opensequence/core';
import type { Contact, Run, SignalKind } from '../../domain/entities.js';
import type { Repositories, TransactionScope } from '../../domain/repositories.js';
import type { Deps } from '../deps.js';
import { effectiveSettings, type EffectiveSettings } from '../projects/shared.js';
import { setChannelStatus } from '../senders/set-channel-status.js';
import { completeTask } from '../tasks/complete-task.js';
import { recordSignal } from './record-signal.js';

export interface IngestCounts {
  stored: number;
  ignored: number;
}

export interface IngestOptions {
  /** The channel the events were polled for; `channel_status` events apply to it. */
  channelId?: string;
}

/** The longest inbound body kept; a reply past it is cut, never dropped. */
export const MAX_INBOUND_BODY = 20_000;

const DEFAULT_CALL_OUTCOMES: Record<string, string> = {
  ANSWERED: 'connected',
  TRANSFERRED_AI: 'connected',
  TRANSFERRED_EXTERNAL: 'connected',
  VOICEMAIL: 'voicemail',
};

export async function ingestInboundEvents(deps: Deps, projectId: string, provider: string, events: InboundEvent[], opts: IngestOptions = {}): Promise<IngestCounts> {
  const counts: IngestCounts = { stored: 0, ignored: 0 };
  const project = await deps.uow.repos.projects.byId(projectId);
  if (!project) {
    counts.ignored = events.length;
    return counts;
  }
  const settings = effectiveSettings(project);
  for (const event of events) {
    const stored = await ingestOne(deps, projectId, provider, settings, event, opts);
    if (stored) counts.stored++;
    else {
      counts.ignored++;
      deps.log.debug({ projectId, provider, kind: event.kind, externalId: event.externalId }, 'inbound event ignored');
    }
  }
  return counts;
}

async function ingestOne(deps: Deps, projectId: string, provider: string, settings: EffectiveSettings, event: InboundEvent, opts: IngestOptions): Promise<boolean> {
  switch (event.kind) {
    case 'reply':
      return deps.uow.transaction((scope) => ingestReply(deps, scope, projectId, provider, settings, event));
    case 'bounce':
      return deps.uow.transaction(async (scope) => {
        const contact = (await contactByOriginalMessage(scope.repos, projectId, event.originalMessageId)) ?? (await scope.repos.contacts.byEmail(projectId, event.address));
        if (!contact) return false;
        await signal(deps, scope, projectId, contact, provider, event, 'bounce', 'email', { hard: event.hard, reason: event.reason ?? null });
        return true;
      });
    case 'complaint':
      return deps.uow.transaction(async (scope) => {
        const contact = await scope.repos.contacts.byEmail(projectId, event.address);
        if (!contact) return false;
        await signal(deps, scope, projectId, contact, provider, event, 'complaint', 'email', {});
        return true;
      });
    case 'opt_out':
      return deps.uow.transaction(async (scope) => {
        const contact = event.channel === 'sms' ? await scope.repos.contacts.byPhone(projectId, event.from) : await scope.repos.contacts.byEmail(projectId, event.from);
        if (!contact) return false;
        await signal(deps, scope, projectId, contact, provider, event, 'opt_out', event.channel, {});
        return true;
      });
    case 'sent':
      return deps.uow.transaction((scope) => ingestSent(scope, projectId, provider, event));
    case 'call_completed':
      return ingestCallCompleted(deps, projectId, settings, event);
    case 'meeting_booked':
      return deps.uow.transaction(async (scope) => {
        const contact = await scope.repos.contacts.byEmail(projectId, event.attendee);
        if (!contact) return false;
        await signal(deps, scope, projectId, contact, provider, event, 'meeting_booked', null, { starts_at: event.startsAt.toISOString() });
        return true;
      });
    case 'channel_status':
      if (!opts.channelId) return false;
      await setChannelStatus(deps, opts.channelId, event.status);
      return true;
  }
}

type ReplyEvent = Extract<InboundEvent, { kind: 'reply' }>;

async function ingestReply(deps: Deps, scope: TransactionScope, projectId: string, provider: string, settings: EffectiveSettings, event: ReplyEvent): Promise<boolean> {
  const { repos } = scope;
  const match = await matchReply(repos, projectId, settings, event);
  if (!match) return false;
  const { contact, senderId, run } = match;

  if (!(await repos.messages.byProviderId(projectId, provider, event.externalId))) {
    await repos.messages.insert({
      id: deps.ids.next('message'),
      projectId,
      contactId: contact.id,
      senderId,
      runId: run?.id ?? null,
      channel: event.channel,
      direction: 'in',
      fromAddress: event.from,
      toAddress: event.to,
      subject: event.subject ?? null,
      body: settings.store_inbound_bodies ? capBody(event.body) : null,
      status: 'received',
      provider,
      providerId: event.externalId,
      threadRef: event.threadRef ?? run?.threadRef ?? null,
      messageId: null,
      occurredAt: event.occurredAt,
    });
  }
  const payload: Record<string, unknown> = { run_id: run?.id ?? null, sender_id: senderId };
  if (event.autoReply) {
    await signal(deps, scope, projectId, contact, provider, event, 'ooo', event.channel, { ...payload, until: event.autoReply.until?.toISOString() ?? null });
  } else {
    await signal(deps, scope, projectId, contact, provider, event, 'reply', event.channel, payload);
  }
  return true;
}

interface ReplyMatch {
  contact: Contact;
  senderId: string;
  run: Run | null;
}

/** Email: the thread or the Message-ID we sent; outside a thread only when the project opted in. SMS: the numbers. */
async function matchReply(repos: Repositories, projectId: string, settings: EffectiveSettings, event: ReplyEvent): Promise<ReplyMatch | null> {
  if (event.channel === 'email') {
    const run = (event.threadRef ? await repos.runs.byThreadRef(projectId, event.threadRef) : null) ?? (await runByMessageId(repos, projectId, event.inReplyTo));
    if (run) {
      const e = await repos.enrollments.byId(run.enrollmentId);
      const contact = e ? await repos.contacts.byId(projectId, e.contactId) : null;
      return contact ? { contact, senderId: run.senderId, run } : null;
    }
    if (!settings.match_replies_outside_thread) return null;
    const contact = await repos.contacts.byEmail(projectId, event.from);
    const channel = await repos.senders.channelByAddress(projectId, 'email', event.to);
    return contact && channel ? { contact, senderId: channel.senderId, run: null } : null;
  }
  if (event.channel === 'sms') {
    const contact = await repos.contacts.byPhone(projectId, event.from);
    const channel = await repos.senders.channelByAddress(projectId, 'sms', event.to);
    return contact && channel ? { contact, senderId: channel.senderId, run: null } : null;
  }
  return null;
}

async function runByMessageId(repos: Repositories, projectId: string, messageId: string | undefined): Promise<Run | null> {
  if (!messageId) return null;
  const m = await repos.messages.byMessageId(projectId, messageId);
  return m?.runId ? repos.runs.byId(m.runId) : null;
}

async function contactByOriginalMessage(repos: Repositories, projectId: string, messageId: string | undefined): Promise<Contact | null> {
  if (!messageId) return null;
  const m = await repos.messages.byMessageId(projectId, messageId);
  return m ? repos.contacts.byId(projectId, m.contactId) : null;
}

/** A provider's own "sent" notice confirms a send and stamps delivery on the run that carries its reference. */
async function ingestSent(scope: TransactionScope, projectId: string, provider: string, event: Extract<InboundEvent, { kind: 'sent' }>): Promise<boolean> {
  const { repos } = scope;
  const run = await repos.runs.byProviderRef(projectId, provider, event.externalId);
  if (!run) return false;
  const outcome = (run.result['outcome'] as Record<string, unknown> | undefined) ?? {};
  await repos.runs.patchResult(run.id, { outcome: { ...outcome, delivered_at: event.occurredAt.toISOString() } });
  const message = await repos.messages.byProviderId(projectId, provider, event.externalId);
  if (message) await repos.messages.update(message.id, { status: 'delivered', providerId: event.externalId });
  return true;
}

/** An outbound Allo call by the acting sender to the contact's number completes the open call task. */
async function ingestCallCompleted(deps: Deps, projectId: string, settings: EffectiveSettings, event: Extract<InboundEvent, { kind: 'call_completed' }>): Promise<boolean> {
  if (event.direction !== 'outbound') return false;
  const repos = deps.uow.repos;
  const contact = await repos.contacts.byPhone(projectId, event.to);
  const channel = await repos.senders.channelByAddress(projectId, 'sms', event.from);
  if (!contact || !channel) return false;
  const task = await repos.tasks.openCall(channel.senderId, contact.id);
  if (!task || !task.autoComplete) return false;
  const outcome = settings.allo?.outcome_map?.[event.result] ?? DEFAULT_CALL_OUTCOMES[event.result] ?? 'no_answer';
  await completeTask(deps, projectId, task.id, event.summary ? { outcome, note: event.summary } : { outcome }, 'allo');
  return true;
}

async function signal(deps: Deps, scope: TransactionScope, projectId: string, contact: Contact, provider: string, event: InboundEvent, kind: SignalKind, channel: string | null, payload: Record<string, unknown>): Promise<void> {
  await recordSignal(deps, scope, { projectId, contactId: contact.id, kind, channel, source: provider, externalId: event.externalId, occurredAt: event.occurredAt, payload });
}

function capBody(body: string | undefined): string | null {
  const text = body?.trim();
  if (!text) return null;
  return text.length > MAX_INBOUND_BODY ? `${text.slice(0, MAX_INBOUND_BODY).trimEnd()}…` : text;
}
