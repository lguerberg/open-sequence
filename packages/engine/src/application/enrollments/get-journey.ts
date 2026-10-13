import type { Contact, Enrollment, Message, Run, Signal, Task, Version } from '../../domain/entities.js';
import { notFound } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';

export interface Journey {
  enrollment: Enrollment;
  contact: Contact;
  version: Version;
  runs: Run[];
  messages: Message[];
  signals: Signal[];
  tasks: Task[];
}

/** One contact's path: the pinned definition plus every run (with the facts each decision read), message, signal and task. */
export async function getJourney(deps: Deps, projectId: string, enrollmentId: string): Promise<Journey> {
  const repos = deps.uow.repos;
  const enrollment = await repos.enrollments.byId(enrollmentId);
  if (!enrollment || enrollment.projectId !== projectId) throw notFound('Enrollment', enrollmentId);
  const [contact, version, runs] = await Promise.all([repos.contacts.byId(projectId, enrollment.contactId), repos.sequences.version(projectId, enrollment.versionId), repos.runs.byEnrollment(enrollment.id)]);
  if (!contact || !version) throw notFound('Enrollment', enrollmentId);
  const [messages, signals, tasks] = await Promise.all([
    repos.messages.byContact(contact.id, 200),
    repos.signals.byContact(contact.id, 200),
    repos.tasks.list(projectId, { contactId: contact.id }, { limit: 100 }),
  ]);
  const runIds = new Set(runs.map((r) => r.id));
  return {
    enrollment,
    contact,
    version,
    runs,
    messages: messages.filter((m) => (m.runId ? runIds.has(m.runId) : m.occurredAt >= enrollment.enrolledAt)),
    signals: signals.filter((s) => s.occurredAt >= enrollment.enrolledAt || (s.attributedRunId ? runIds.has(s.attributedRunId) : false)),
    tasks: tasks.items.filter((t) => t.enrollmentId === enrollment.id),
  };
}
