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
import { getSenderReadiness, listSenders } from './senders.js';
import { getSequence, listSequences, validateSequenceDefinition } from './sequences.js';
import { completeTask, listTasks } from './tasks.js';

export const tools: readonly ToolDefinition[] = [
  listSequences,
  getSequence,
  validateSequenceDefinition,
  listSenders,
  getSenderReadiness,
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
