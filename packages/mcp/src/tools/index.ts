/** Every tool, in the order clients list them. The names are the public contract. */
import type { ToolDefinition } from '../tool.js';
import { analyticsNodes, analyticsSummary } from './analytics.js';
import {
  getContact,
  getContactTimeline,
  listContacts,
  reportContactEvent,
  upsertContact,
} from './contacts.js';
import {
  enrollContacts,
  exitEnrollment,
  getEnrollmentJourney,
  listEnrollments,
  previewEnrollment,
} from './enrollments.js';
import { getSender, getSenderReadiness, listSenders, upsertSender } from './senders.js';
import {
  createSequence,
  getSequence,
  listSequences,
  setSequenceStatus,
  validateSequenceDefinition,
} from './sequences.js';
import { completeTask, listTasks } from './tasks.js';
import {
  createSequenceVersion,
  getSequenceVersion,
  publishSequenceVersion,
  saveSequenceDraft,
} from './versions.js';

export const tools: readonly ToolDefinition[] = [
  listSequences,
  getSequence,
  validateSequenceDefinition,
  getSequenceVersion,
  createSequence,
  saveSequenceDraft,
  publishSequenceVersion,
  createSequenceVersion,
  setSequenceStatus,
  listSenders,
  getSender,
  getSenderReadiness,
  upsertSender,
  upsertContact,
  getContact,
  listContacts,
  getContactTimeline,
  previewEnrollment,
  enrollContacts,
  exitEnrollment,
  getEnrollmentJourney,
  listEnrollments,
  listTasks,
  completeTask,
  analyticsSummary,
  analyticsNodes,
  reportContactEvent,
];

export const toolNames: readonly string[] = tools.map((t) => t.name);
