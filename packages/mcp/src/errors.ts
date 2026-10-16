/**
 * Turns whatever a tool threw into a stable `code` and a plain-English message an agent can act
 * on. The API's own wording is kept unless a rewrite here says something more useful to an agent
 * (who is in the way, which tool to call next, which variable to check). Never includes the key.
 */
import { OpenSequenceError } from '@opensequence/sdk';
import type { AlreadyInSequenceDetails, ValidationProblem } from '@opensequence/sdk';
import { ToolError } from './tool.js';

export interface ExplainedError {
  code: string;
  message: string;
  /** HTTP status; absent when the MCP server refused before calling the API. */
  status?: number;
  details?: unknown;
  requestId?: string;
}

type Rewrite = (err: OpenSequenceError) => string;

type Conflict = AlreadyInSequenceDetails['conflicts'][number];

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function conflictName(c: Conflict): string {
  return c.name || c.external_id || c.contact_id;
}

function conflictWhere(c: Conflict): string {
  const seq = c.sequence_name ? `"${c.sequence_name}"` : c.sequence_id;
  return `${seq}, enrollment ${c.enrollment_id}`;
}

/** "Dana Whitfield is already in a sequence ("UK facilities managers", enrollment enr_…). Nobody was enrolled; …" */
const alreadyInSequence: Rewrite = (err) => {
  const conflicts = (err.details as Partial<AlreadyInSequenceDetails> | undefined)?.conflicts ?? [];
  if (conflicts.length === 0) return err.message;
  const names = conflicts.map(conflictName);
  if (conflicts.length === 1) {
    const c = conflicts[0]!;
    return `${names[0]} is already in a sequence (${conflictWhere(c)}). Nobody was enrolled; exit that enrollment first (exit_enrollment) or pick another contact.`;
  }
  const where = conflicts.map((c) => `${conflictName(c)}: ${conflictWhere(c)}`).join('; ');
  return `${joinNames(names)} are already in a sequence (${where}). Nobody was enrolled; exit those enrollments first (exit_enrollment) or leave those contacts out.`;
};

/** The message as a sentence, so a hint can follow it. */
function sentence(message: string): string {
  return /[.!?]$/.test(message.trim()) ? message.trim() : `${message.trim()}.`;
}

/** Where the key came from depends on the transport, so the hint names both. */
const CHECK_KEY =
  'Check the project API key: OPENSEQUENCE_API_KEY for a local server, the Authorization header for a hosted one.';

/** Publish refused: the validator's errors, each with its path, and how to get past them. */
const invalidDefinition: Rewrite = (err) => {
  const problems = (err.details as { problems?: ValidationProblem[] } | undefined)?.problems ?? [];
  const errors = problems.filter((p) => p.severity === 'error');
  if (errors.length === 0) return err.message;
  const list = errors
    .slice(0, 10)
    .map((p) => `${p.path || '(document)'}: ${p.message} (${p.code})`)
    .join('; ');
  const more = errors.length > 10 ? `; and ${errors.length - 10} more (see details)` : '';
  const noun = errors.length === 1 ? 'error' : 'errors';
  return `Not published: the definition has ${errors.length} ${noun}, and errors block publishing. ${list}${more}. Fix them in the draft (save_sequence_draft), then publish again.`;
};

/** The draft tools name the tool to call next, because each refusal has one obvious way out. */
const staleLock: Rewrite = () =>
  'Someone saved this draft after you read it, so your save was refused and nothing changed. Read the version again (get_sequence_version), apply your edit to that definition, and save with the lock_version it returns.';

const notEditable: Rewrite = (err) =>
  `${sentence(err.message)} Published versions never change: make a new draft from it (create_sequence_version), edit that, and publish it.`;

const tagTaken: Rewrite = (err) =>
  `${sentence(err.message)} Pick another tag, or leave tag out to get the next free one.`;

const hasActiveEnrollments: Rewrite = (err) => {
  const active = (err.details as { active?: number } | undefined)?.active;
  const who =
    active === undefined
      ? 'Contacts are'
      : active === 1
        ? '1 contact is'
        : `${active} contacts are`;
  return `${who} still in this sequence, so it was not archived. Pause it instead (status "paused"), or archive with exit_active: true, which exits every one of them now.`;
};

const rewrites: Record<string, Rewrite> = {
  ALREADY_IN_SEQUENCE: alreadyInSequence,
  INVALID_DEFINITION: invalidDefinition,
  STALE_LOCK: staleLock,
  VERSION_NOT_EDITABLE: notEditable,
  TAG_TAKEN: tagTaken,
  HAS_ACTIVE_ENROLLMENTS: hasActiveEnrollments,
  UNAUTHORIZED: (err) => `${sentence(err.message)} ${CHECK_KEY}`,
  HTTP_401: () => `The API refused the key. ${CHECK_KEY}`,
  NETWORK_ERROR: (err) =>
    `${sentence(err.message)} Check OPENSEQUENCE_URL and that the service is running.`,
  TIMEOUT: (err) => `${sentence(err.message)} The service may be busy; try again.`,
};

export function explainError(err: unknown): ExplainedError {
  if (err instanceof OpenSequenceError) {
    const rewrite = rewrites[err.code];
    return {
      code: err.code,
      message: rewrite ? rewrite(err) : err.message,
      status: err.status,
      details: err.details,
      requestId: err.requestId,
    };
  }
  if (err instanceof ToolError)
    return { code: err.code, message: err.message, details: err.details };
  const message = err instanceof Error ? err.message : String(err);
  return { code: 'INTERNAL_ERROR', message: `The OpenSequence MCP server failed: ${message}` };
}
