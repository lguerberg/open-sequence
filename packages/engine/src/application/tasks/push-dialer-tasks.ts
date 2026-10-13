/**
 * Pushes open call tasks marked `dialer` into the sender's Allo power-dialer queue (docs 7.7 and
 * 9.1b). The sender's sms channel is the Allo identity (its config holds the user id); a duplicate
 * in the queue counts as pushed. Senders without an sms channel and contacts without a phone are
 * logged and skipped, and come back on the next tick until someone fixes them.
 */
import type { ChannelRef } from '@opensequence/core';
import type { SenderChannel, Task } from '../../domain/entities.js';
import type { Deps } from '../deps.js';

const CONFLICT = 'DIALING_QUEUE_APPEND_CONFLICT';

export interface PushDialerResult {
  pushed: number;
  skipped: number;
}

export async function pushDialerTasks(deps: Deps, limit: number): Promise<PushDialerResult> {
  const repos = deps.uow.repos;
  const tasks = await repos.tasks.openUnpushedDialerTasks(limit);
  const bySender = new Map<string, Task[]>();
  for (const t of tasks) bySender.set(t.senderId, [...(bySender.get(t.senderId) ?? []), t]);

  const result: PushDialerResult = { pushed: 0, skipped: 0 };
  for (const [senderId, senderTasks] of bySender) {
    const channel = await repos.senders.channel(senderId, 'sms');
    if (!channel) {
      deps.log.warn({ senderId, tasks: senderTasks.length }, 'dialer push skipped: the sender has no sms channel');
      result.skipped += senderTasks.length;
      continue;
    }
    for (const task of senderTasks) {
      const ok = await pushOne(deps, channelRef(channel), task);
      if (ok) {
        await repos.tasks.update(task.id, { dialerPushedAt: deps.clock.now() });
        result.pushed++;
      } else {
        result.skipped++;
      }
    }
  }
  return result;
}

async function pushOne(deps: Deps, channel: ChannelRef, task: Task): Promise<boolean> {
  const contact = await deps.uow.repos.contacts.byId(task.projectId, task.contactId);
  if (!contact?.phone) {
    deps.log.warn({ taskId: task.id, contactId: task.contactId }, 'dialer push skipped: the contact has no phone');
    return false;
  }
  const number = { number: contact.phone, name: contact.firstName ?? undefined, lastName: contact.lastName ?? undefined, emails: contact.email ? [contact.email] : undefined };
  try {
    const out = await deps.providers.dialer.pushNumbers({ channel, numbers: [number], idempotencyKey: task.id });
    const rejected = out.skipped.filter((s) => !s.reason.includes(CONFLICT));
    if (out.added === 0 && rejected.length) {
      deps.log.warn({ taskId: task.id, reason: rejected[0]!.reason }, 'dialer push skipped by the provider');
      return false;
    }
    return true;
  } catch (err) {
    if (isConflict(err)) return true;
    deps.log.error({ taskId: task.id, err }, 'dialer push failed');
    return false;
  }
}

function channelRef(c: SenderChannel): ChannelRef {
  const ref: ChannelRef = { projectId: c.projectId, senderId: c.senderId, channelId: c.id, address: c.address, config: c.config };
  if (c.connectionId) ref.connectionId = c.connectionId;
  return ref;
}

function isConflict(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: unknown }).code;
  return code === CONFLICT || err.message.includes(CONFLICT);
}
