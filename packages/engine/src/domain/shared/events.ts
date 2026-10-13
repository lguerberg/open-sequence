/**
 * Domain events become outbound webhooks (docs/ARCHITECTURE.md section 9.2). A use case raises them
 * inside its transaction; the unit of work writes one delivery per matching endpoint in the same
 * transaction, so an event cannot be raised without being queued for delivery.
 */
export type EventType =
  | 'enrollment.created'
  | 'enrollment.exited'
  | 'enrollment.completed'
  | 'enrollment.paused'
  | 'enrollment.resumed'
  | 'run.done'
  | 'run.skipped'
  | 'run.failed'
  | 'run.needs_review'
  | 'task.created'
  | 'task.expired'
  | 'signal.received'
  | 'sender.channel_status'
  | 'endpoint.disabled';

export const EVENT_TYPES: readonly EventType[] = [
  'enrollment.created',
  'enrollment.exited',
  'enrollment.completed',
  'enrollment.paused',
  'enrollment.resumed',
  'run.done',
  'run.skipped',
  'run.failed',
  'run.needs_review',
  'task.created',
  'task.expired',
  'signal.received',
  'sender.channel_status',
  'endpoint.disabled',
];

export interface DomainEvent {
  type: EventType;
  projectId: string;
  /** Deliveries for one enrollment are ordered; across enrollments they are not. */
  enrollmentId?: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
}
