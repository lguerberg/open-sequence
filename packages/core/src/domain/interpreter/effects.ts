/**
 * Effects are the only contract between the pure interpreter and the shell that touches the world.
 * The interpreter returns data; `advance` (in the engine) applies it. A node type can be added
 * without the shell knowing it exists, because it can only ask for one of these.
 */
import type { Definition } from '../definition/schema.js';
import type { FactRecord, FactReader } from '../conditions/facts.js';
import type { TemplateContext } from '../template/render.js';

export interface RunDraft {
  nodeId: string;
  nodeType: string;
  channel?: string;
  action?: string;
  /** Whether this run is an outreach touch (drives touch_number and attribution). */
  touch: boolean;
  /** The node's transitions, so an executor can follow `sent`, `skipped` or `failed` without the definition. */
  next: Record<string, string>;
  result: Record<string, unknown>;
}

export interface TaskDraft {
  kind: string;
  title: string;
  body?: string;
  link?: string;
  dueAt: Date;
  expiresAt: Date;
  /** Outcomes that count as a reply. */
  connectedOutcomes: readonly string[];
  /** For kind "call": push the number into the sender's dialer. */
  dialer: boolean;
  autoComplete: boolean;
  /** The outcome opening the task completes it with (a LinkedIn task is done once its profile is opened). Absent: opening only records the time. */
  completeOnOpen?: string;
  /** Where the flow goes: by outcome first, then `completed`, and `no_answer` on expiry. */
  branchesByOutcome: Record<string, string>;
  onCompleted?: string;
  onExpired?: string;
}

export type Effect =
  | { kind: 'record'; run: RunDraft; status: 'done' | 'skipped'; branch?: string }
  | {
      kind: 'goto';
      nodeId: string;
      at?: Date;
      /**
       * A node putting itself off until `at` (outreach outside its send time). The shell persists
       * the time so that, when the step runs again, `state.deferredUntil` tells it this is the
       * wake-up it asked for and not a fresh entry.
       */
      deferred?: true;
    }
  | { kind: 'enqueue'; queue: string; run: RunDraft }
  | { kind: 'create_task'; task: TaskDraft; run: RunDraft }
  | {
      kind: 'wait';
      until: Date | null;
      /** event name to the node it leads to */
      events: Record<string, string>;
      onTimeout?: string;
      run: RunDraft;
    }
  | { kind: 'exit'; reason: string }
  | { kind: 'complete' };

export interface EnrollmentState {
  enrollmentId: string;
  versionId: string;
  contactId: string;
  senderId: string;
  currentNodeId: string;
  touchCount: number;
  lastTouchAt: Date | null;
  status: 'active' | 'paused' | 'waiting_limit';
  /**
   * Set when the current node is running again because it deferred itself (a `goto` with
   * `deferred: true`) or its executor deferred it: the time that deferral was for. Null on a
   * fresh entry into the node.
   */
  deferredUntil: Date | null;
}

export interface TimingContext {
  /** The contact's zone when known, otherwise null. */
  contactTz: string | null;
  senderTz: string;
  /** A source of randomness for jitter; injected so tests are deterministic. */
  random: () => number;
}

export interface InterpretContext {
  definition: Definition;
  state: EnrollmentState;
  facts: FactReader;
  now: Date;
  timing: TimingContext;
  template: TemplateContext;
  /** Collected by the interpreter as facts are read, for the run ledger. */
  factLog: FactRecord[];
}

export interface StepResult {
  effects: Effect[];
  facts: FactRecord[];
}
