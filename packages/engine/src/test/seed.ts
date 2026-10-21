/**
 * Rows a test needs before it can enroll anyone: a project of its own (the database is shared with
 * other test files, so nothing here is ever truncated), a sender, a published start-to-end version
 * and as many contacts as asked. Ids come from the real generator, so nothing collides.
 */
import type { Enrollment } from '../domain/entities.js';
import type { Repositories } from '../domain/repositories.js';
import { emptyDraft } from '../application/sequences/shared.js';
import { newId } from '../infrastructure/ids.js';

export interface Seed {
  projectId: string;
  senderId: string;
  sequenceId: string;
  versionId: string;
  contactIds: string[];
}

export async function seedSequence(repos: Repositories, opts: { contacts?: number; definition?: Record<string, unknown> } = {}): Promise<Seed> {
  const projectId = newId('project');
  await repos.projects.create({ id: projectId, slug: projectId.slice(-20).toLowerCase(), name: 'Test project', settings: {} });
  const sender = await repos.senders.upsertByExternalId({ id: newId('sender'), projectId, externalId: 'u1', name: 'Ann Tester', email: 'ann@example.com', timezone: 'UTC', status: 'active', attrs: {} });
  const sequence = await repos.sequences.create({ id: newId('sequence'), projectId, externalId: null, name: `Seq ${projectId.slice(-6)}`, description: null, createdBy: null, labels: {}, status: 'active', defaultVersionId: null });
  const version = await repos.sequences.createVersion({
    id: newId('version'),
    projectId,
    sequenceId: sequence.id,
    tag: 'v1',
    status: 'published',
    definition: opts.definition ?? emptyDraft(),
    schemaVersion: 1,
    lockVersion: 0,
    basedOnVersionId: null,
    createdBy: null,
    publishedBy: null,
    publishedAt: new Date(),
    archivedAt: null,
  });
  const contactIds: string[] = [];
  for (let i = 0; i < (opts.contacts ?? 1); i++) {
    const c = await repos.contacts.upsertByExternalId(
      { id: newId('contact'), projectId, externalId: `c${i}`, firstName: 'Bo', lastName: `N${i}`, email: `bo${i}@example.com`, phone: null, country: 'US', timezone: null, smsConsent: false, smsConsentAt: null, smsConsentSource: null, attrs: {} },
      false
    );
    contactIds.push(c.id);
  }
  return { projectId, senderId: sender.id, sequenceId: sequence.id, versionId: version.id, contactIds };
}

/** An active enrollment row due now, at the start node. */
export function enrollmentRow(seed: Seed, contactId: string, patch: Partial<Enrollment> = {}): Omit<Enrollment, 'createdAt' | 'updatedAt' | 'seq'> {
  return {
    id: newId('enrollment'),
    projectId: seed.projectId,
    sequenceId: seed.sequenceId,
    versionId: seed.versionId,
    contactId,
    senderId: seed.senderId,
    enrolledBy: null,
    enrolledByKind: 'test',
    mode: 'live',
    status: 'active',
    currentNodeId: 'start',
    nextRunAt: new Date(Date.now() - 1000),
    ownerRunId: null,
    waiting: null,
    deferral: null,
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
    enrolledAt: new Date(),
    finishedAt: null,
    ...patch,
  };
}
