/**
 * The unit of work: one transaction, the repositories bound to it, and the domain events raised
 * inside it. Before commit, every event becomes one webhook delivery per matching endpoint (an
 * outbox), and the queue is told about each delivery in the same transaction when the backend can
 * join it (postgres) or right after commit otherwise.
 */
import type { Queue } from '@opensequence/core';
import type { Repositories, TransactionScope, UnitOfWork } from '../../domain/repositories.js';
import type { DomainEvent } from '../../domain/shared/events.js';
import type { Clock, IdGenerator } from '../../domain/shared/clock.js';
import type { Db, DbOrTx } from './db.js';
import { DrizzleProjectRepository } from './repositories/projects.repo.js';
import { DrizzleSenderRepository } from './repositories/senders.repo.js';
import { DrizzleContactRepository } from './repositories/contacts.repo.js';
import { DrizzleSequenceRepository } from './repositories/sequences.repo.js';
import { DrizzleEnrollmentRepository, DrizzleRunRepository } from './repositories/enrollments.repo.js';
import { DrizzleMessageRepository, DrizzleSignalRepository, DrizzleTaskRepository } from './repositories/messages-tasks-signals.repo.js';
import { DrizzleIdempotencyRepository, DrizzleSchedulerRepository, DrizzleWebhookRepository } from './repositories/webhooks-misc.repo.js';
import { DrizzleAnalyticsQueries } from './analytics.queries.js';

export const WEBHOOK_QUEUE = 'seq_webhooks';

export function makeRepositories(db: DbOrTx): Repositories {
  return {
    projects: new DrizzleProjectRepository(db),
    senders: new DrizzleSenderRepository(db),
    contacts: new DrizzleContactRepository(db),
    sequences: new DrizzleSequenceRepository(db),
    enrollments: new DrizzleEnrollmentRepository(db),
    runs: new DrizzleRunRepository(db),
    messages: new DrizzleMessageRepository(db),
    tasks: new DrizzleTaskRepository(db),
    signals: new DrizzleSignalRepository(db),
    webhooks: new DrizzleWebhookRepository(db),
    idempotency: new DrizzleIdempotencyRepository(db),
    scheduler: new DrizzleSchedulerRepository(db),
    analytics: new DrizzleAnalyticsQueries(db),
  };
}

export class DrizzleUnitOfWork implements UnitOfWork {
  readonly repos: Repositories;

  constructor(
    private readonly db: Db,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly queue: Queue,
    /** Whether `queue.send` can join a Drizzle transaction (the postgres backend). */
    private readonly queueJoinsTransaction: boolean
  ) {
    this.repos = makeRepositories(db);
  }

  async transaction<T>(fn: (scope: TransactionScope) => Promise<T>): Promise<T> {
    const events: DomainEvent[] = [];
    const afterCommit: string[] = [];
    const result = await this.db.transaction(async (tx) => {
      const scope: TransactionScope = {
        repos: makeRepositories(tx),
        tx,
        raise: (e) => events.push({ ...e, occurredAt: e.occurredAt ?? this.clock.now() }),
      };
      const out = await fn(scope);
      const deliveryIds = await this.writeOutbox(scope.repos, events);
      if (this.queueJoinsTransaction) {
        for (const id of deliveryIds) await this.queue.send(WEBHOOK_QUEUE, { v: 1, delivery_id: id }, { tx });
      } else {
        afterCommit.push(...deliveryIds);
      }
      return out;
    });
    for (const id of afterCommit) {
      // A crash here is covered by the reaper, which re-enqueues due pending deliveries.
      await this.queue.send(WEBHOOK_QUEUE, { v: 1, delivery_id: id }).catch(() => {});
    }
    return result;
  }

  private async writeOutbox(repos: Repositories, events: DomainEvent[]): Promise<string[]> {
    const ids: string[] = [];
    for (const event of events) {
      const endpoints = await repos.webhooks.activeEndpointsFor(event.projectId, event.type);
      if (endpoints.length === 0) continue;
      const eventId = this.ids.next('event');
      const payload = {
        id: eventId,
        type: event.type,
        project: event.projectId,
        occurred_at: event.occurredAt.toISOString(),
        data: event.payload,
      };
      const rows = await repos.webhooks.insertDeliveries(
        endpoints.map((ep) => ({
          id: this.ids.next('delivery'),
          projectId: event.projectId,
          endpointId: ep.id,
          eventId,
          eventType: event.type,
          enrollmentId: event.enrollmentId ?? null,
          payload,
          status: 'pending',
          nextAttemptAt: event.occurredAt,
        }))
      );
      ids.push(...rows.map((r) => r.id));
    }
    return ids;
  }
}
