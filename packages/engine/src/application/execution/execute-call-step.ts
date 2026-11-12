/**
 * The agent call executor. It does not dial: it asks the provider's AI agent to call the contact
 * and parks the step. The provider places the call inside its calling hours and retries it; the
 * `calls` job reads the result and closes the step on the outcome (see sync-agent-calls.ts).
 *
 * Consent and a phone number are gates here. The agent comes from the step; the line is the
 * sender's Allo number (their sms channel) unless the step fixes one, so each contact is called
 * from their own rep's line. The provider has no idempotency key, so a
 * retry first looks for the call it may already have created.
 */
import { addDuration, AGENT_CALL_LIMITS, agentCallParamsSchema, render, type AgentCallSkills } from '@opensequence/core';
import type { Enrollment } from '../../domain/entities.js';
import type { Deps } from '../deps.js';
import { loadDefinition } from '../enrollments/shared.js';
import { channelEnabled } from '../projects/channel-enabled.js';
import type { StepOutcome } from './execute-email-step.js';
import { deferRun, failRun, loadStep, needsReview, skipRun } from './shared.js';

const PROVIDER = 'allo';
/** The step is set up wrong (agent, line, key permissions): fail it so someone sees it, rather than skip contact after contact. */
const MISCONFIGURED = /LINE_NOT_AGENT_CALLING_LINE|OUTBOUND_AGENT_NOT_FOUND|PHONE_NUMBER_NOT_FOUND|OUTBOUND_CALLS_NOT_AVAILABLE|SKILL_NOT_ACCEPTED|SKILL_INVALID|CREDENTIALS_MISSING/;

export async function executeCallStep(deps: Deps, runId: string, attempt: number): Promise<StepOutcome> {
  const now = deps.clock.now();
  const env = await loadStep(deps, runId);
  if (!env) return 'stale';
  const { run, ctx } = env;
  const contact = ctx.contact;

  if (!contact.outreachConsent) return skipRun(deps, run, 'no_consent', now).then(() => 'skipped');
  if (!contact.phone) return skipRun(deps, run, 'no_phone', now).then(() => 'skipped');
  const sup = await deps.uow.repos.contacts.suppressions(contact.id);
  if (sup.some((s) => s.channel === 'call' || s.channel === 'all')) return skipRun(deps, run, 'suppressed', now).then(() => 'skipped');
  if (!(await channelEnabled(deps, run.projectId, 'call'))) return deferRun(deps, run, new Date(now.getTime() + 5 * 60_000), 'kill_switch').then(() => 'deferred');

  const def = await loadDefinition(deps.uow.repos, run.projectId, env.enrollment.versionId);
  const parsed = agentCallParamsSchema.safeParse(def.nodes[run.nodeId]?.params ?? {});
  if (!parsed.success) return failRun(deps, run, `the call step has invalid params: ${parsed.error.issues[0]?.message ?? 'unknown'}`, now).then(() => 'failed');
  const p = parsed.data;
  const from = p.allo_number ?? ctx.channels.find((c) => c.channel === 'sms')?.address;
  if (!from) return skipRun(deps, run, 'no_allo_number', now).then(() => 'skipped');
  const title = render(p.title, env.template);
  const description = p.description ? render(p.description, env.template) : null;
  const smsText = p.skills?.sms?.text ? render(p.skills.sms.text, env.template) : null;
  const request = {
    projectId: run.projectId,
    agentId: p.agent_id,
    from,
    to: contact.phone,
    // Variables can push a rendered text over the provider's limit; it refuses the call then.
    title: title.text.slice(0, AGENT_CALL_LIMITS.title),
    ...(description?.text.trim() ? { description: description.text.slice(0, AGENT_CALL_LIMITS.description) } : {}),
    ...(p.skills ? { skills: skillsOf(p.skills, smsText?.text.slice(0, AGENT_CALL_LIMITS.smsText)) } : {}),
    idempotencyKey: run.idempotencyKey,
  };

  try {
    // A retry must never call twice: look for the call this run may already have created.
    const since = new Date((run.startedAt ?? now).getTime() - 60_000);
    const already = attempt > 1 ? await deps.providers.calls.find({ projectId: run.projectId, agentId: p.agent_id, to: contact.phone, title: request.title, since }) : null;
    const call = already ?? (await deps.providers.calls.create(request));
    const giveUpAt = addDuration(now, p.give_up_after, ctx.sender.timezone);
    const rendered = { ...title.used, ...(description?.used ?? {}), ...(smsText?.used ?? {}) };
    await deps.uow.transaction(async (scope) => {
      const e = await scope.repos.enrollments.lock(run.enrollmentId);
      if (!e || e.ownerRunId !== run.id) return;
      const touchNumber = e.touchCount + 1;
      await scope.repos.runs.update(run.id, {
        status: 'waiting',
        provider: PROVIDER,
        providerRef: call.id,
        touchNumber,
        result: { ...run.result, rendered, agent_id: p.agent_id, from, give_up_at: giveUpAt.toISOString(), call: { attempts: call.attempts, last_outcome: call.outcome, last_call_id: call.lastCallId } },
      });
      // The give-up time is the wait's timeout: advance closes the run on `timeout` and follows not_reached.
      const onTimeout = run.next['not_reached'] ?? run.next['completed'];
      const patch: Partial<Enrollment> = { touchCount: touchNumber, lastTouchAt: now, ownerRunId: null, nextRunAt: giveUpAt, waiting: onTimeout ? { runId: run.id, events: {}, onTimeout } : { runId: run.id, events: {} } };
      await scope.repos.enrollments.update(e.id, patch);
    });
    return 'done';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = typeof (err as { status?: unknown }).status === 'number' ? (err as { status: number }).status : null;
    if (status === 429) return deferRun(deps, run, new Date(now.getTime() + 60_000), 'provider_quota').then(() => 'deferred');
    if (MISCONFIGURED.test(message) || status === 401 || status === 403) return failRun(deps, run, message, now).then(() => 'failed');
    if (status === 400 || status === 404) return skipRun(deps, run, `provider_rejected:${message.slice(0, 40)}`, now).then(() => 'skipped');
    // Unknown (a timeout, a 5xx): the call may exist. The next attempt looks for it before creating another.
    if (attempt < 3) return 'retry';
    await needsReview(deps, run, message, now);
    return 'failed';
  }
}

type SkillParams = NonNullable<ReturnType<typeof agentCallParamsSchema.parse>['skills']>;

function skillsOf(skills: SkillParams, smsText: string | undefined): AgentCallSkills {
  const out: AgentCallSkills = {};
  if (skills.sms) out.sms = smsText ? { text: smsText } : {};
  if (skills.book) out.book = { calendarId: skills.book.calendar_id, eventTypeId: skills.book.event_type_id };
  if (skills.transfer) out.transfer = skills.transfer.type === 'member' ? { type: 'member', userId: skills.transfer.user_id } : { type: skills.transfer.type, number: skills.transfer.number };
  return out;
}
