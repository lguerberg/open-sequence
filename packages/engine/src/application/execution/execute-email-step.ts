/**
 * The email executor (docs section 7.3). Gates, throttle, then one send through the sender's
 * mailbox with our own Message-ID as the idempotency key; crash recovery asks the provider
 * whether that Message-ID already went out before sending again.
 */
import { render } from '@opensequence/core';
import type { Deps } from '../deps.js';
import { emailProviderOf } from '../senders/shared.js';
import { channelGate, completeRun, deferRun, failRun, loadStep, skipRun, windowGate, type StepEnv } from './shared.js';

export type StepOutcome = 'done' | 'skipped' | 'deferred' | 'failed' | 'stale' | 'retry';

export function messageIdFor(env: StepEnv, domain: string): string {
  return `<${env.run.idempotencyKey.replace(/[^a-z0-9]/gi, '.')}@${domain}>`;
}

export async function executeEmailStep(deps: Deps, runId: string, attempt: number): Promise<StepOutcome> {
  const now = deps.clock.now();
  const env = await loadStep(deps, runId);
  if (!env) return 'stale';
  const { run, ctx } = env;

  const contact = ctx.contact;
  if (!contact.email) return skipRun(deps, run, 'no_email', now).then(() => 'skipped');
  const sup = await deps.uow.repos.contacts.suppressions(contact.id);
  if (sup.some((s) => s.channel === 'email' || s.channel === 'all')) return skipRun(deps, run, 'suppressed', now).then(() => 'skipped');
  for (const gate of [await channelGate(deps, env, 'email', now), await windowGate(deps, env, 'email', now)]) {
    if (gate.ok) continue;
    if ('skip' in gate) return skipRun(deps, run, gate.skip, now).then(() => 'skipped');
    return deferRun(deps, run, gate.defer, gate.reason).then(() => 'deferred');
  }

  const channel = ctx.channels.find((c) => c.channel === 'email')!;
  const params = (await loadParams(deps, env)) as { subject: string; body: string; format?: 'text' | 'html'; reply_in_thread?: boolean };
  const html = params.format === 'html';
  const subject = render(params.subject, env.template).text;
  const body = render(params.body, env.template, { html });
  const domain = channel.address.split('@')[1] ?? 'opensequence.local';
  const messageId = messageIdFor(env, domain);
  const unsubscribe = env.template.unsubscribe_url!;
  const headers = { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
  const provider = emailProviderOf(channel);
  const channelRef = { projectId: run.projectId, senderId: ctx.sender.id, channelId: channel.id, connectionId: channel.connectionId ?? undefined, address: channel.address, config: channel.config };

  // Reply in the thread of the previous email of this enrollment, when asked.
  // In-Reply-To names the last email; References lists every email of the thread so far (RFC 5322 3.6.4).
  let inReplyTo: string | undefined;
  let references: string[] | undefined;
  let threadRef: string | undefined;
  if (params.reply_in_thread) {
    const sentEmails = (await deps.uow.repos.runs.byEnrollment(run.enrollmentId)).filter((r) => r.channel === 'email' && r.status === 'done' && r.threadRef);
    const previous = sentEmails.at(-1);
    if (previous?.result['message_id']) inReplyTo = String(previous.result['message_id']);
    if (previous?.threadRef) {
      threadRef = previous.threadRef;
      const ids = sentEmails.filter((r) => r.threadRef === threadRef && r.result['message_id']).map((r) => String(r.result['message_id']));
      if (ids.length) references = ids;
    }
  }

  try {
    const already = attempt > 1 ? await deps.providers.email.findSent({ channel: channelRef, messageId }) : null;
    const sent = already ?? (await deps.providers.email.send({ channel: channelRef, to: contact.email, subject, text: html ? stripHtml(body.text) : body.text, html: html ? body.text : undefined, messageId, inReplyTo, references, threadRef, headers }));
    await deps.uow.repos.messages.insert({
      id: deps.ids.next('message'),
      projectId: run.projectId,
      contactId: contact.id,
      senderId: ctx.sender.id,
      runId: run.id,
      channel: 'email',
      direction: 'out',
      fromAddress: channel.address,
      toAddress: contact.email,
      subject,
      body: body.text,
      status: 'sent',
      provider,
      providerId: sent.providerId,
      threadRef: sent.threadRef,
      messageId,
      occurredAt: now,
    });
    await completeRun(deps, run, { provider, providerRef: sent.providerId, threadRef: sent.threadRef, result: { ...run.result, message_id: messageId, rendered: body.used, outcome: { delivered_at: now.toISOString() } } }, now);
    return 'done';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/credentials_needed|invalid_grant|401/i.test(message)) {
      await deps.uow.repos.senders.updateChannel(channel.id, { status: 'credentials_needed' });
      return deferRun(deps, run, new Date(now.getTime() + 60 * 60_000), 'credentials_needed').then(() => 'deferred');
    }
    if (attempt >= deps.config.maxReads) return failRun(deps, run, message, now).then(() => 'failed');
    deps.log.warn({ runId, attempt, err: message }, 'email send failed, will retry');
    return 'retry';
  }
}

async function loadParams(deps: Deps, env: StepEnv): Promise<Record<string, unknown>> {
  const { loadDefinition } = await import('../enrollments/shared.js');
  const def = await loadDefinition(deps.uow.repos, env.run.projectId, env.enrollment.versionId);
  return def.nodes[env.run.nodeId]?.params ?? {};
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+\n/g, '\n').trim();
}
