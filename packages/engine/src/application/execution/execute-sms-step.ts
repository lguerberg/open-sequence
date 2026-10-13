/**
 * The SMS executor. Consent, country, a known recipient time zone and the 08:00 to 21:00 window are
 * legal requirements, so they are gates here even though the planner checked nothing. The provider
 * has no idempotency key, so an unknown outcome searches recent outbound texts before anything is
 * retried, and still ends in needs_review when that is inconclusive.
 */
import { render } from '@opensequence/core';
import type { Deps } from '../deps.js';
import { loadDefinition } from '../enrollments/shared.js';
import type { StepOutcome } from './execute-email-step.js';
import { channelGate, completeRun, deferRun, loadStep, needsReview, skipRun, windowGate } from './shared.js';

export async function executeSmsStep(deps: Deps, runId: string, attempt: number): Promise<StepOutcome> {
  const now = deps.clock.now();
  const env = await loadStep(deps, runId);
  if (!env) return 'stale';
  const { run, ctx, settings } = env;
  const contact = ctx.contact;

  if (!contact.smsConsent) return skipRun(deps, run, 'no_consent', now).then(() => 'skipped');
  if (!contact.phone) return skipRun(deps, run, 'no_phone', now).then(() => 'skipped');
  if (!contact.country || !settings.sms_countries.includes(contact.country)) return skipRun(deps, run, 'country_not_allowed', now).then(() => 'skipped');
  const sup = await deps.uow.repos.contacts.suppressions(contact.id);
  if (sup.some((s) => s.channel === 'sms' || s.channel === 'all')) return skipRun(deps, run, 'suppressed', now).then(() => 'skipped');
  for (const gate of [await channelGate(deps, env, 'sms', now), await windowGate(deps, env, 'sms', now)]) {
    if (gate.ok) continue;
    if ('skip' in gate) return skipRun(deps, run, gate.skip, now).then(() => 'skipped');
    return deferRun(deps, run, gate.defer, gate.reason).then(() => 'deferred');
  }

  const channel = ctx.channels.find((c) => c.channel === 'sms')!;
  const def = await loadDefinition(deps.uow.repos, run.projectId, env.enrollment.versionId);
  const body = render(String(def.nodes[run.nodeId]?.params?.['body'] ?? ''), env.template);
  const channelRef = { projectId: run.projectId, senderId: ctx.sender.id, channelId: channel.id, address: channel.address, config: channel.config };

  try {
    // A retry must never text twice: look for the same text to this number in the last ten minutes first.
    const already = attempt > 1 ? await deps.providers.sms.findSent({ channel: channelRef, to: contact.phone, body: body.text, since: new Date(now.getTime() - 10 * 60_000) }) : null;
    const sent = already ?? (await deps.providers.sms.send({ channel: channelRef, to: contact.phone, body: body.text, idempotencyKey: run.idempotencyKey }));
    await deps.uow.repos.messages.insert({
      id: deps.ids.next('message'),
      projectId: run.projectId,
      contactId: contact.id,
      senderId: ctx.sender.id,
      runId: run.id,
      channel: 'sms',
      direction: 'out',
      fromAddress: channel.address,
      toAddress: contact.phone,
      subject: null,
      body: body.text,
      status: 'sent',
      provider: 'allo',
      providerId: sent.providerId,
      threadRef: null,
      messageId: null,
      occurredAt: now,
    });
    await completeRun(deps, run, { provider: 'allo', providerRef: sent.providerId, threadRef: null, result: { ...run.result, rendered: body.used } }, now);
    return 'done';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/API_KEY_QUOTA_EXCEEDED|429/.test(message)) return deferRun(deps, run, new Date(now.getTime() + 60 * 60_000), 'provider_quota').then(() => 'deferred');
    if (/FROM_NUMBER_NOT_FOUND|INVALID_TO_NUMBER|TO_NUMBER_COUNTRY_MISMATCH|INVALID_LENGTH|PROVIDER_NOT_SUPPORTED|400/.test(message)) {
      return skipRun(deps, run, `provider_rejected:${message.slice(0, 40)}`, now).then(() => 'skipped');
    }
    // Anything else is an unknown outcome: never auto-retry a text.
    await needsReview(deps, run, message, now);
    return 'failed';
  }
}
