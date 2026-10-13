/**
 * Enroll contacts in a sequence (docs section 7.1 and 10.6). A contact can be in at most one active
 * sequence per project: any conflict fails the whole request with 409 ALREADY_IN_SEQUENCE and
 * enrolls nobody. Other findings (suppressed, re-enrollment too soon, no usable channel for the
 * first step) are reported and excluded without blocking the rest.
 */
import { nextInsideWindow, type Definition } from '@opensequence/core';
import type { Contact, Enrollment, Sequence, Sender, Version } from '../../domain/entities.js';
import { conflict, invalid, notFound } from '../../domain/shared/errors.js';
import { externalIdOf } from '../../infrastructure/ids.js';
import { upsertContact } from '../contacts/upsert-contact.js';
import type { ContactInput } from '../contacts/shared.js';
import type { Deps } from '../deps.js';
import { resolveSender } from '../senders/resolve-sender.js';
import { resolveSequence } from '../sequences/resolve-sequence.js';
import { enrollmentPayload, loadDefinition } from './shared.js';

export interface EnrollInput {
  contacts: Array<string | ({ external_id: string } & ContactInput)>;
  sender: string;
  version?: string;
  enrolled_by?: string;
  enrolled_by_kind?: 'user' | 'agent' | 'system';
  mode?: 'live' | 'dry_run';
}

export interface Skipped {
  contact_id: string;
  external_id: string;
  reason: string;
}

export interface EnrollPreview {
  accepted: Array<{ contact_id: string; external_id: string; first_touch_at: string }>;
  skipped: Skipped[];
  capacity: { per_day: number; days_to_first_touches: number };
}

export interface EnrollResult extends EnrollPreview {
  enrollments: Enrollment[];
}

async function resolveContacts(deps: Deps, projectId: string, items: EnrollInput['contacts']): Promise<Contact[]> {
  if (items.length === 0) throw invalid('NO_CONTACTS', 'Give at least one contact.');
  if (items.length > 5000) throw invalid('BATCH_TOO_LARGE', 'At most 5,000 contacts per call.');
  const repos = deps.uow.repos;
  const out = new Map<string, Contact>();
  const serviceIds: string[] = [];
  const externals: string[] = [];
  for (const item of items) {
    if (typeof item === 'string') {
      const ext = externalIdOf(item);
      if (ext === null) serviceIds.push(item);
      else externals.push(ext);
    } else {
      const { external_id, ...rest } = item;
      const c = await upsertContact(deps, projectId, external_id, rest);
      out.set(c.id, c);
    }
  }
  for (const c of await repos.contacts.byIds(projectId, serviceIds)) out.set(c.id, c);
  for (const c of await repos.contacts.byExternalIds(projectId, externals)) out.set(c.id, c);
  const missing = [...serviceIds, ...externals].filter((x) => ![...out.values()].some((c) => c.id === x || c.externalId === x));
  if (missing.length) throw notFound('Contact', missing.slice(0, 5).join(', '));
  return [...out.values()];
}

function reenrollAllowed(def: Definition, last: Enrollment | null, now: Date): string | null {
  if (!last) return null;
  const rule = def.settings.reenroll;
  if (rule === 'always') return null;
  if (rule === 'never') return 'already_enrolled_before';
  const days = Number(/^after_(\d+)d$/.exec(rule)?.[1] ?? '0');
  const since = last.finishedAt ?? last.enrolledAt;
  return now.getTime() - since.getTime() < days * 86_400_000 ? `reenroll_before_${days}d` : null;
}

export async function enrollContacts(deps: Deps, projectId: string, idOrExternal: string, input: EnrollInput, opts: { preview: boolean }): Promise<EnrollResult> {
  const now = deps.clock.now();
  const sequence: Sequence = await resolveSequence(deps, projectId, idOrExternal);
  if (sequence.status !== 'active') throw conflict('SEQUENCE_NOT_ACTIVE', `The sequence is ${sequence.status}.`);
  const sender: Sender = await resolveSender(deps, projectId, input.sender);
  if (sender.status !== 'active') throw conflict('SENDER_DISABLED', `${sender.name} is disabled.`);
  const versionId = input.version ?? sequence.defaultVersionId;
  if (!versionId) throw conflict('NO_PUBLISHED_VERSION', 'This sequence has no published version yet.');
  const version: Version | null = await deps.uow.repos.sequences.version(projectId, versionId);
  if (!version || version.sequenceId !== sequence.id) throw notFound('Version', versionId);
  if (version.status !== 'published') throw conflict('VERSION_NOT_PUBLISHED', `Version ${version.tag} is ${version.status}; only a published version can enroll.`);
  const def = await loadDefinition(deps.uow.repos, projectId, version.id);
  const contacts = await resolveContacts(deps, projectId, input.contacts);

  // 1. conflicts: all-or-nothing
  const conflicts = await deps.uow.repos.enrollments.activeByContacts(projectId, contacts.map((c) => c.id));
  if (conflicts.length) {
    const details = [];
    for (const k of conflicts) {
      const c = contacts.find((x) => x.id === k.contactId)!;
      const s = await deps.uow.repos.sequences.byId(projectId, k.sequenceId);
      const v = await deps.uow.repos.sequences.version(projectId, k.versionId);
      const snd = await deps.uow.repos.senders.byId(projectId, k.senderId);
      details.push({
        contact_id: c.id,
        external_id: c.externalId,
        name: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email,
        sequence_id: k.sequenceId,
        sequence_name: s?.name ?? null,
        version: v?.tag ?? null,
        sender: snd?.name ?? null,
        enrollment_id: k.enrollmentId,
        status: k.status,
      });
    }
    throw conflict(
      'ALREADY_IN_SEQUENCE',
      `${conflicts.length} of the ${contacts.length} contacts are already in a sequence. Nobody was enrolled. Remove them from the selection or exit them from their current sequence first.`,
      { conflicts: details }
    );
  }

  // 2. exclusions with reasons
  const channels = await deps.uow.repos.senders.channels(sender.id);
  const emailChannel = channels.find((c) => c.channel === 'email' && c.status === 'active');
  const perDay = Math.max(1, emailChannel?.dailyLimit ?? 30);
  const window = def.settings.send_window;
  const accepted: Contact[] = [];
  const skipped: Skipped[] = [];
  for (const c of contacts) {
    const sup = await deps.uow.repos.contacts.suppressions(c.id);
    if (sup.some((s) => s.channel === 'all')) {
      skipped.push({ contact_id: c.id, external_id: c.externalId, reason: `suppressed:${sup.find((s) => s.channel === 'all')!.reason}` });
      continue;
    }
    const last = await deps.uow.repos.enrollments.lastBySequenceAndContact(sequence.id, c.id);
    const why = reenrollAllowed(def, last, now);
    if (why) {
      skipped.push({ contact_id: c.id, external_id: c.externalId, reason: why });
      continue;
    }
    accepted.push(c);
  }

  // 3. stagger first touches by the sender's daily capacity and the send window
  const zone = sender.timezone;
  const firstTouchAt = (index: number): Date => {
    const dayOffset = Math.floor(index / perDay);
    let at = new Date(now.getTime() + dayOffset * 86_400_000);
    if (window) at = nextInsideWindow(at, window, zone);
    return at;
  };
  const rows = accepted.map((c, i) => ({ contact: c, at: firstTouchAt(i) }));
  const preview: EnrollPreview = {
    accepted: rows.map((r) => ({ contact_id: r.contact.id, external_id: r.contact.externalId, first_touch_at: r.at.toISOString() })),
    skipped,
    capacity: { per_day: perDay, days_to_first_touches: Math.ceil(accepted.length / perDay) },
  };
  if (opts.preview) return { ...preview, enrollments: [] };

  // 4. insert, all in one transaction; the unique index is the last line of defence
  const enrollments = await deps.uow.transaction(async ({ repos, raise }) => {
    let inserted: Enrollment[];
    try {
      inserted = await repos.enrollments.insertMany(
        rows.map(({ contact, at }) => ({
          id: deps.ids.next('enrollment'),
          projectId,
          sequenceId: sequence.id,
          versionId: version.id,
          contactId: contact.id,
          senderId: sender.id,
          enrolledBy: input.enrolled_by ?? null,
          enrolledByKind: input.enrolled_by_kind ?? 'user',
          mode: input.mode ?? 'live',
          status: 'active',
          currentNodeId: def.entry,
          nextRunAt: at,
          ownerRunId: null,
          waiting: null,
          pausedUntil: null,
          pauseReason: null,
          exitReason: null,
          exitSignalId: null,
          repliedAt: null,
          repliedChannel: null,
          meetingBookedAt: null,
          meetingChannel: null,
          touchCount: 0,
          lastTouchAt: null,
          enrolledAt: now,
          finishedAt: null,
        }))
      );
    } catch (err) {
      if (err instanceof Error && /enrollments_one_active_idx/.test(String((err as { cause?: Error }).cause?.message ?? err.message))) {
        throw conflict('ALREADY_IN_SEQUENCE', 'A contact was enrolled elsewhere at the same moment. Nobody was enrolled; try again.', { conflicts: [] });
      }
      throw err;
    }
    for (const e of inserted) {
      raise({ type: 'enrollment.created', projectId, enrollmentId: e.id, payload: { enrollment: enrollmentPayload(e) } });
    }
    return inserted;
  });
  return { ...preview, enrollments };
}
