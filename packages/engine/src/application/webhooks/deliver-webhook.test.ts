import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WebhookDelivery } from '../../domain/entities.js';
import { newId } from '../../infrastructure/ids.js';
import { closeTestDb, migrateTestDb, testDb } from '../../test/db.js';
import { makeTestDeps, RecordingTransport, type TestDeps } from '../../test/engine-stubs.js';
import { consumeDeliveryMessage } from './consume-delivery-message.js';
import { createEndpoint } from './create-endpoint.js';
import { deliverWebhook } from './deliver-webhook.js';
import { enableEndpoint } from './enable-endpoint.js';
import { sign } from './shared.js';


async function project(deps: TestDeps): Promise<string> {
  const id = newId('project');
  await deps.uow.repos.projects.create({ id, slug: id.slice(-20).toLowerCase(), name: 'Webhooks', settings: {} });
  return id;
}

async function pendingDelivery(deps: TestDeps, projectId: string, endpointId: string, patch: Partial<WebhookDelivery> = {}): Promise<WebhookDelivery> {
  const [row] = await deps.uow.repos.webhooks.insertDeliveries([
    {
      id: newId('delivery'),
      projectId,
      endpointId,
      eventId: newId('event'),
      eventType: 'run.done',
      enrollmentId: null,
      payload: { type: 'run.done', data: { run: 'run_1' } },
      status: 'pending',
      nextAttemptAt: new Date(),
      ...patch,
    },
  ]);
  return row!;
}

async function endpointFor(deps: TestDeps, projectId: string, types: string[] = ['*']): Promise<{ id: string; secret: string }> {
  // createEndpoint resolves DNS; the test host resolves to a public address through the real resolver only
  // if the network is up, so we create the row through the repository with a secret we know.
  const secret = 'whsec_' + Buffer.from('a'.repeat(32)).toString('base64');
  const { ciphertext, keyId } = await deps.secrets.encrypt(secret);
  const e = await deps.uow.repos.webhooks.createEndpoint({ id: newId('webhookEndpoint'), projectId, url: 'https://93.184.216.34/seq', secretEnc: ciphertext, keyId, eventTypes: types, status: 'active' });
  return { id: e.id, secret };
}

describe('deliverWebhook', () => {
  beforeAll(migrateTestDb);
  afterAll(closeTestDb);

  it('posts the signed body and marks the delivery delivered on a 2xx', async () => {
    const deps = makeTestDeps({ transport: new RecordingTransport([{ status: 204 }]) });
    const projectId = await project(deps);
    const ep = await endpointFor(deps, projectId);
    const d = await pendingDelivery(deps, projectId, ep.id);

    const result = await deliverWebhook(deps, d.id);
    expect(result).toEqual({ outcome: 'delivered' });

    const post = deps.webhookTransport.posts[0]!;
    expect(post.url).toBe('https://93.184.216.34/seq');
    expect(post.timeoutMs).toBe(10_000);
    expect(JSON.parse(post.body)).toEqual(d.payload);
    expect(post.headers['webhook-id']).toBe(d.eventId);
    const ts = Number(post.headers['webhook-timestamp']);
    expect(post.headers['webhook-signature']).toBe(sign(ep.secret, d.eventId, ts, post.body));

    const after = (await deps.uow.repos.webhooks.delivery(d.id))!;
    expect(after.status).toBe('delivered');
    expect(after.attempts).toBe(1);
    expect(after.lastStatusCode).toBe(204);
    expect(after.deliveredAt).not.toBeNull();
  });

  it('schedules a retry on a 500 and the consumer releases the message with that delay', async () => {
    const deps = makeTestDeps({ transport: new RecordingTransport([{ status: 500 }]) });
    const projectId = await project(deps);
    const ep = await endpointFor(deps, projectId);
    const d = await pendingDelivery(deps, projectId, ep.id);
    await deps.queue.send('seq_webhooks', { v: 1, delivery_id: d.id });
    const [message] = await deps.queue.read('seq_webhooks', { visibilityTimeoutMs: 30_000, count: 1 });

    await consumeDeliveryMessage(deps, message!);

    const after = (await deps.uow.repos.webhooks.delivery(d.id))!;
    expect(after.status).toBe('pending');
    expect(after.attempts).toBe(1);
    expect(after.lastStatusCode).toBe(500);
    expect(after.lastError).toBe('HTTP 500');
    expect(after.nextAttemptAt!.getTime() - Date.now()).toBeGreaterThan(3_000);
    expect(after.nextAttemptAt!.getTime() - Date.now()).toBeLessThanOrEqual(5_000);
    const live = deps.queue.messages.find((m) => m.id === message!.id)!;
    expect(live.archived).toBeUndefined();
    expect(live.visibleAt - Date.now()).toBeGreaterThan(3_000);
  });

  it('fails the delivery for good once the schedule is exhausted', async () => {
    const deps = makeTestDeps({ transport: new RecordingTransport([{ status: 503 }]) });
    const projectId = await project(deps);
    const ep = await endpointFor(deps, projectId);
    const d = await pendingDelivery(deps, projectId, ep.id);
    await deps.uow.repos.webhooks.updateDelivery(d.id, { attempts: 8 });

    expect(await deliverWebhook(deps, d.id)).toEqual({ outcome: 'failed' });
    const after = (await deps.uow.repos.webhooks.delivery(d.id))!;
    expect(after.status).toBe('failed');
    expect(after.attempts).toBe(9);
  });

  it('disables the endpoint after three days of failures and tells the other endpoints', async () => {
    const deps = makeTestDeps({ transport: new RecordingTransport([{ status: 0, error: 'connect ECONNREFUSED' }]) });
    const projectId = await project(deps);
    const failing = await endpointFor(deps, projectId, ['run.done']);
    const observer = await endpointFor(deps, projectId, ['endpoint.disabled']);
    const d = await pendingDelivery(deps, projectId, failing.id);
    await testDb().execute(sql`update seq.webhook_deliveries set created_at = now() - interval '4 days' where id = ${d.id}`);

    expect(await deliverWebhook(deps, d.id)).toEqual({ outcome: 'disabled' });

    const endpoint = (await deps.uow.repos.webhooks.endpoint(projectId, failing.id))!;
    expect(endpoint.status).toBe('disabled');
    expect(endpoint.disabledReason).toMatch(/3 days.*ECONNREFUSED/);
    expect(endpoint.disabledAt).not.toBeNull();
    expect((await deps.uow.repos.webhooks.delivery(d.id))!.status).toBe('disabled');

    const notices = await deps.uow.repos.webhooks.listDeliveries(observer.id, { limit: 10 });
    expect(notices.items).toHaveLength(1);
    expect(notices.items[0]!.eventType).toBe('endpoint.disabled');
    expect((notices.items[0]!.payload['data'] as { endpoint: { id: string } }).endpoint.id).toBe(failing.id);
    expect(deps.queue.on('seq_webhooks').map((m) => (m.payload as { delivery_id: string }).delivery_id)).toContain(notices.items[0]!.id);
  });

  it('holds deliveries while disabled and enabling replays them', async () => {
    const deps = makeTestDeps({ transport: new RecordingTransport([{ status: 200 }]) });
    const projectId = await project(deps);
    const ep = await endpointFor(deps, projectId);
    await deps.uow.repos.webhooks.updateEndpoint(ep.id, { status: 'disabled', disabledReason: 'test', disabledAt: new Date() });
    const d = await pendingDelivery(deps, projectId, ep.id);

    expect(await deliverWebhook(deps, d.id)).toEqual({ outcome: 'disabled' });
    expect(deps.webhookTransport.posts).toHaveLength(0);

    const enabled = await enableEndpoint(deps, projectId, ep.id);
    expect(enabled.replayed).toBe(1);
    expect(enabled.endpoint['status']).toBe('active');
    expect((await deps.uow.repos.webhooks.delivery(d.id))!.status).toBe('pending');
    expect(deps.queue.on('seq_webhooks')).toHaveLength(1);
    expect(await deliverWebhook(deps, d.id)).toEqual({ outcome: 'delivered' });
  });

  it('delivers one enrollment\'s events in order: the later one waits, then is enqueued by the earlier one', async () => {
    const deps = makeTestDeps({ transport: new RecordingTransport([{ status: 200 }]) });
    const projectId = await project(deps);
    const ep = await endpointFor(deps, projectId);
    const enrollmentId = newId('enrollment');
    const first = await pendingDelivery(deps, projectId, ep.id, { enrollmentId, eventType: 'enrollment.created' });
    await testDb().execute(sql`update seq.webhook_deliveries set created_at = now() - interval '1 second' where id = ${first.id}`);
    const second = await pendingDelivery(deps, projectId, ep.id, { enrollmentId, eventType: 'run.done' });

    expect(await deliverWebhook(deps, second.id)).toEqual({ outcome: 'waiting' });
    expect(deps.webhookTransport.posts).toHaveLength(0);

    expect(await deliverWebhook(deps, first.id)).toEqual({ outcome: 'delivered' });
    expect(deps.queue.on('seq_webhooks').map((m) => (m.payload as { delivery_id: string }).delivery_id)).toEqual([second.id]);
    expect(await deliverWebhook(deps, second.id)).toEqual({ outcome: 'delivered' });
    expect(deps.webhookTransport.posts.map((p) => JSON.parse(p.body).type ?? p.headers['webhook-id'])).toHaveLength(2);
  });

  it('skips a delivery that is no longer pending and archives a message it cannot read', async () => {
    const deps = makeTestDeps();
    const projectId = await project(deps);
    const ep = await endpointFor(deps, projectId);
    const d = await pendingDelivery(deps, projectId, ep.id, { status: 'delivered' });
    expect(await deliverWebhook(deps, d.id)).toEqual({ outcome: 'skipped' });
    expect(await deliverWebhook(deps, 'wdl_missing')).toEqual({ outcome: 'skipped' });

    await deps.queue.send('seq_webhooks', { v: 1 });
    const [message] = await deps.queue.read('seq_webhooks', { visibilityTimeoutMs: 1000, count: 1 });
    await consumeDeliveryMessage(deps, message!);
    expect(deps.queue.messages.find((m) => m.id === message!.id)!.archived).toBe('unknown payload');
  });

  it('createEndpoint returns the secret once and refuses unsafe URLs', async () => {
    const deps = makeTestDeps();
    const projectId = await project(deps);
    await expect(createEndpoint(deps, projectId, { url: 'http://hooks.example.com/x' })).rejects.toMatchObject({ code: 'UNSAFE_URL' });
    await expect(createEndpoint(deps, projectId, { url: 'https://localhost/x' })).rejects.toMatchObject({ code: 'UNSAFE_URL' });
    await expect(createEndpoint(deps, projectId, { url: 'https://hooks.example.com/x', event_types: ['bogus'] })).rejects.toMatchObject({ code: 'UNKNOWN_EVENT_TYPE' });
    // A literal public IP needs no DNS, so this works offline.
    const created = await createEndpoint(deps, projectId, { url: 'https://93.184.216.34/hooks', event_types: ['run.done'] });
    expect(created.secret.startsWith('whsec_')).toBe(true);
    expect(created.endpoint).not.toHaveProperty('secret');
    expect(created.endpoint).not.toHaveProperty('secretEnc');
    expect(created.endpoint['event_types']).toEqual(['run.done']);
    const stored = (await deps.uow.repos.webhooks.endpoint(projectId, created.endpoint['id'] as string))!;
    expect(await deps.secrets.decrypt(stored.secretEnc, stored.keyId)).toBe(created.secret);
  });
});

