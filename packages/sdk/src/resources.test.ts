/** Every resource method hits the route it claims: method, path (including the `:` routes), query and body. */
import { describe, expect, test } from 'vitest';
import { OpenSequence } from './index.js';
import { fakeFetch, type FakeFetch } from './test-helpers.test.js';

const BASE = 'https://seq.example.com';

interface Expected {
  method: string;
  url: string;
  body?: unknown;
}

/** Runs the call against a fake fetch and checks what went over the wire. */
async function hits(call: (oseq: OpenSequence) => Promise<unknown>, expected: Expected, data: unknown = {}): Promise<FakeFetch> {
  const fetch = fakeFetch();
  const oseq = new OpenSequence({ baseUrl: BASE, apiKey: 'sk', fetch });
  fetch.reply(data);
  await call(oseq);
  const last = fetch.last();
  expect(last.method).toBe(expected.method);
  expect(last.url).toBe(`${BASE}${expected.url}`);
  if (expected.body === undefined) expect(last.body).toBeUndefined();
  else expect(JSON.parse(last.body!)).toEqual(expected.body);
  return fetch;
}

describe('senders', () => {
  test('upsert', () => hits((o) => o.senders.upsert('u_42', { name: 'Max', timezone: 'Europe/London' }), { method: 'PUT', url: '/v1/senders/u_42', body: { name: 'Max', timezone: 'Europe/London' } }));
  test('get', () => hits((o) => o.senders.get('u_42'), { method: 'GET', url: '/v1/senders/u_42' }));
  test('list', () => hits((o) => o.senders.list({ limit: 10 }), { method: 'GET', url: '/v1/senders?limit=10' }, []));
  test('readiness', () => hits((o) => o.senders.readiness('u_42'), { method: 'GET', url: '/v1/senders/u_42/readiness' }));
  test('connectGoogle sends an empty object by default', () => hits((o) => o.senders.connectGoogle('u_42'), { method: 'POST', url: '/v1/senders/u_42/connections/google', body: {} }));
  test('connectGoogle with a return url', () => hits((o) => o.senders.connectGoogle('u_42', { return_url: 'https://acme.com/done' }), { method: 'POST', url: '/v1/senders/u_42/connections/google', body: { return_url: 'https://acme.com/done' } }));
  test('connections', () => hits((o) => o.senders.connections('u_42'), { method: 'GET', url: '/v1/senders/u_42/connections' }, []));
  test('disconnectGoogle', () => hits((o) => o.senders.disconnectGoogle('u_42'), { method: 'DELETE', url: '/v1/senders/u_42/connections/google' }));
  test('setSms', () => hits((o) => o.senders.setSms('u_42', { allo_user_id: 'usr-1', number: '+14155551234' }), { method: 'PUT', url: '/v1/senders/u_42/channels/sms', body: { allo_user_id: 'usr-1', number: '+14155551234' } }));
  test('patchChannel', () => hits((o) => o.senders.patchChannel('u_42', 'email', { daily_limit: 20, status: 'paused' }), { method: 'PATCH', url: '/v1/senders/u_42/channels/email', body: { daily_limit: 20, status: 'paused' } }));
  test('setSmtp', () => {
    const server = (host: string, port: number) => ({ host, port, secure: true, user: 'max@fastmail.com', password: 'app-password' });
    const body = { provider: 'smtp' as const, smtp: server('smtp.fastmail.com', 465), imap: server('imap.fastmail.com', 993) };
    return hits((o) => o.senders.setSmtp('u_42', body), { method: 'PUT', url: '/v1/senders/u_42/channels/email', body });
  });
  test('deleteChannel', () => hits((o) => o.senders.deleteChannel('u_42', 'sms'), { method: 'DELETE', url: '/v1/senders/u_42/channels/sms' }));
  test('deleteChannel email', () => hits((o) => o.senders.deleteChannel('u_42', 'email'), { method: 'DELETE', url: '/v1/senders/u_42/channels/email' }));
  test('disable', () => hits((o) => o.senders.disable('u_42'), { method: 'DELETE', url: '/v1/senders/u_42' }));
  test('tasks', () => hits((o) => o.senders.tasks('u_42', { status: 'open', kind: 'call' }), { method: 'GET', url: '/v1/senders/u_42/tasks?status=open&kind=call' }, []));
});

describe('contacts', () => {
  test('upsert', () => hits((o) => o.contacts.upsert('p_7', { first_name: 'Dana', email: 'dana@example.com', attrs: { company: { country: 'UK' } } }), { method: 'PUT', url: '/v1/contacts/p_7', body: { first_name: 'Dana', email: 'dana@example.com', attrs: { company: { country: 'UK' } } } }));
  test('batch uses the colon route and wraps in { contacts }', () =>
    hits((o) => o.contacts.batch([{ external_id: 'p_1', email: 'a@x.com' }]), { method: 'POST', url: '/v1/contacts:batch', body: { contacts: [{ external_id: 'p_1', email: 'a@x.com' }] } }, []));
  test('list with filters', () => hits((o) => o.contacts.list({ email: 'a@x.com', external_id: 'p_1' }), { method: 'GET', url: '/v1/contacts?email=a%40x.com&external_id=p_1' }, []));
  test('get', () => hits((o) => o.contacts.get('ctc_1'), { method: 'GET', url: '/v1/contacts/ctc_1' }));
  test('timeline', () => hits((o) => o.contacts.timeline('ctc_1'), { method: 'GET', url: '/v1/contacts/ctc_1/timeline' }, []));
  test('patch', () => hits((o) => o.contacts.patch('ctc_1', { attrs: { deal: 'open' } }), { method: 'PATCH', url: '/v1/contacts/ctc_1', body: { attrs: { deal: 'open' } } }));
  test('statuses uses the colon route and wraps in { ids }', () => hits((o) => o.contacts.statuses(['p_1', 'ctc_2']), { method: 'POST', url: '/v1/contacts:status', body: { ids: ['p_1', 'ctc_2'] } }, []));
  test('reportEvent serializes a Date', () =>
    hits((o) => o.contacts.reportEvent('p_7', { id: 'evt_1', type: 'meeting_booked', occurred_at: new Date('2026-10-13T09:00:00Z') }), { method: 'POST', url: '/v1/contacts/p_7/events', body: { id: 'evt_1', type: 'meeting_booked', occurred_at: '2026-10-13T09:00:00.000Z' } }));
  test('reportEvents uses the colon route and wraps in { events }', () =>
    hits((o) => o.contacts.reportEvents([{ contact: 'p_7', id: 'evt_2', type: 'opt_out', channel: 'all' }]), { method: 'POST', url: '/v1/contacts:events', body: { events: [{ contact: 'p_7', id: 'evt_2', type: 'opt_out', channel: 'all' }] } }, []));
  test('setSmsConsent', () => hits((o) => o.contacts.setSmsConsent('p_7', { consent: true, source: 'web form' }), { method: 'PUT', url: '/v1/contacts/p_7/sms-consent', body: { consent: true, source: 'web form' } }));
  test('delete', () => hits((o) => o.contacts.delete('p_7'), { method: 'DELETE', url: '/v1/contacts/p_7' }));
});

describe('sequences and versions', () => {
  test('list', () => hits((o) => o.sequences.list(), { method: 'GET', url: '/v1/sequences' }, []));
  test('create', () => hits((o) => o.sequences.create({ name: 'UK intro' }), { method: 'POST', url: '/v1/sequences', body: { name: 'UK intro' } }));
  test('get', () => hits((o) => o.sequences.get('seq_1'), { method: 'GET', url: '/v1/sequences/seq_1' }));
  test('update', () => hits((o) => o.sequences.update('seq_1', { status: 'archived', exit_active: true }), { method: 'PATCH', url: '/v1/sequences/seq_1', body: { status: 'archived', exit_active: true } }));
  test('validate uses the colon route', () => hits((o) => o.sequences.validate({ entry: 'start' }), { method: 'POST', url: '/v1/sequences:validate', body: { definition: { entry: 'start' } } }));
  test('enroll', () => hits((o) => o.sequences.enroll('seq_1', { contacts: ['p_7'], sender: 'u_42', mode: 'dry_run' }), { method: 'POST', url: '/v1/sequences/seq_1/enrollments', body: { contacts: ['p_7'], sender: 'u_42', mode: 'dry_run' } }));
  test('previewEnrollment uses the colon route', () => hits((o) => o.sequences.previewEnrollment('seq_1', { contacts: ['p_7'], sender: 'u_42' }), { method: 'POST', url: '/v1/sequences/seq_1/enrollments:preview', body: { contacts: ['p_7'], sender: 'u_42' } }));
  test('versions.list', () => hits((o) => o.sequences.versions.list('seq_1'), { method: 'GET', url: '/v1/sequences/seq_1/versions' }, []));
  test('versions.create', () => hits((o) => o.sequences.versions.create('seq_1', { tag: 'v2', from_version: 'ver_1' }), { method: 'POST', url: '/v1/sequences/seq_1/versions', body: { tag: 'v2', from_version: 'ver_1' } }));
  test('versions.get', () => hits((o) => o.sequences.versions.get('seq_1', 'ver_1'), { method: 'GET', url: '/v1/sequences/seq_1/versions/ver_1' }));
  test('versions.saveDraft', () => hits((o) => o.sequences.versions.saveDraft('seq_1', 'ver_1', { definition: { entry: 'start' }, lock_version: 3 }), { method: 'PUT', url: '/v1/sequences/seq_1/versions/ver_1/draft', body: { definition: { entry: 'start' }, lock_version: 3 } }));
  test('versions.publish defaults to an empty body', () => hits((o) => o.sequences.versions.publish('seq_1', 'ver_1'), { method: 'POST', url: '/v1/sequences/seq_1/versions/ver_1/publish', body: {} }));
  test('versions.archive', () => hits((o) => o.sequences.versions.archive('seq_1', 'ver_1'), { method: 'POST', url: '/v1/sequences/seq_1/versions/ver_1/archive' }));
  test('versions.delete', () => hits((o) => o.sequences.versions.delete('seq_1', 'ver_1'), { method: 'DELETE', url: '/v1/sequences/seq_1/versions/ver_1' }));
});

describe('enrollments', () => {
  test('list', () => hits((o) => o.enrollments.list({ sequence: 'seq_1', exit_reason: 'replied' }), { method: 'GET', url: '/v1/enrollments?sequence=seq_1&exit_reason=replied' }, []));
  test('get', () => hits((o) => o.enrollments.get('enr_1'), { method: 'GET', url: '/v1/enrollments/enr_1' }));
  test('pause', () => hits((o) => o.enrollments.pause('enr_1', { reason: 'ooo', until: '2026-11-01T00:00:00Z' }), { method: 'POST', url: '/v1/enrollments/enr_1/pause', body: { reason: 'ooo', until: '2026-11-01T00:00:00Z' } }));
  test('resume', () => hits((o) => o.enrollments.resume('enr_1'), { method: 'POST', url: '/v1/enrollments/enr_1/resume' }));
  test('exit', () => hits((o) => o.enrollments.exit('enr_1', { label: 'deal closed' }), { method: 'POST', url: '/v1/enrollments/enr_1/exit', body: { label: 'deal closed' } }));
  test('exitMany uses the colon route', () => hits((o) => o.enrollments.exitMany({ sequence: 'seq_1', status: 'paused' }), { method: 'POST', url: '/v1/enrollments:exit', body: { sequence: 'seq_1', status: 'paused' } }));
});

describe('tasks', () => {
  test('list', () => hits((o) => o.tasks.list({ sender: 'u_42', status: 'open' }), { method: 'GET', url: '/v1/tasks?sender=u_42&status=open' }, []));
  test('get', () => hits((o) => o.tasks.get('tsk_1'), { method: 'GET', url: '/v1/tasks/tsk_1' }));
  test('complete', () => hits((o) => o.tasks.complete('tsk_1', { outcome: 'connected', note: 'call back Monday' }), { method: 'POST', url: '/v1/tasks/tsk_1/complete', body: { outcome: 'connected', note: 'call back Monday' } }));
  test('cancel', () => hits((o) => o.tasks.cancel('tsk_1'), { method: 'POST', url: '/v1/tasks/tsk_1/cancel' }));
});

describe('webhooks', () => {
  test('list', () => hits((o) => o.webhooks.list(), { method: 'GET', url: '/v1/webhooks' }, []));
  test('create', () => hits((o) => o.webhooks.create({ url: 'https://acme.com/hooks', event_types: ['enrollment.exited'] }), { method: 'POST', url: '/v1/webhooks', body: { url: 'https://acme.com/hooks', event_types: ['enrollment.exited'] } }));
  test('get', () => hits((o) => o.webhooks.get('whe_1'), { method: 'GET', url: '/v1/webhooks/whe_1' }));
  test('update', () => hits((o) => o.webhooks.update('whe_1', { event_types: ['*'] }), { method: 'PATCH', url: '/v1/webhooks/whe_1', body: { event_types: ['*'] } }));
  test('delete', () => hits((o) => o.webhooks.delete('whe_1'), { method: 'DELETE', url: '/v1/webhooks/whe_1' }));
  test('rotateSecret', () => hits((o) => o.webhooks.rotateSecret('whe_1'), { method: 'POST', url: '/v1/webhooks/whe_1/rotate-secret' }));
  test('enable', () => hits((o) => o.webhooks.enable('whe_1'), { method: 'POST', url: '/v1/webhooks/whe_1/enable' }));
  test('recover serializes since', () => hits((o) => o.webhooks.recover('whe_1', { since: new Date('2026-10-10T00:00:00Z') }), { method: 'POST', url: '/v1/webhooks/whe_1/recover', body: { since: '2026-10-10T00:00:00.000Z' } }));
  test('deliveries', () => hits((o) => o.webhooks.deliveries('whe_1', { limit: 5 }), { method: 'GET', url: '/v1/webhooks/whe_1/deliveries?limit=5' }, []));
  test('replay', () => hits((o) => o.webhooks.replay('dlv_1'), { method: 'POST', url: '/v1/webhooks/deliveries/dlv_1/replay' }));
});

describe('analytics', () => {
  test('summary with filters', () => hits((o) => o.analytics.summary('seq_1', { from: '2026-10-01', country: 'GB' }), { method: 'GET', url: '/v1/sequences/seq_1/analytics/summary?from=2026-10-01&country=GB' }));
  test('exits', () => hits((o) => o.analytics.exits('seq_1'), { method: 'GET', url: '/v1/sequences/seq_1/analytics/exits' }));
  test('nodes', () => hits((o) => o.analytics.nodes('seq_1'), { method: 'GET', url: '/v1/sequences/seq_1/analytics/nodes' }));
  test('channels', () => hits((o) => o.analytics.channels('seq_1'), { method: 'GET', url: '/v1/sequences/seq_1/analytics/channels' }));
  test('sequences', () => hits((o) => o.analytics.sequences({ min_enrolled: 20 }), { method: 'GET', url: '/v1/analytics/sequences?min_enrolled=20' }));
});

describe('project and schema', () => {
  test('get', () => hits((o) => o.project.get(), { method: 'GET', url: '/v1/project' }));
  test('updateSettings', () => hits((o) => o.project.updateSettings({ attribution_days: 21 }), { method: 'PUT', url: '/v1/project/settings', body: { attribution_days: 21 } }));
  test('setProvider', () => hits((o) => o.project.setProvider('attio', { api_key: 'att_1' }), { method: 'PUT', url: '/v1/project/providers/attio', body: { api_key: 'att_1' } }));
  test('alloNumbers', () => hits((o) => o.project.alloNumbers(), { method: 'GET', url: '/v1/project/providers/allo/numbers' }, []));
  test('alloUsers', () => hits((o) => o.project.alloUsers(), { method: 'GET', url: '/v1/project/providers/allo/users' }, []));
  test('attioSchema', () => hits((o) => o.project.attioSchema(), { method: 'GET', url: '/v1/project/providers/attio/schema' }));
  test('apiKeys.list', () => hits((o) => o.project.apiKeys.list(), { method: 'GET', url: '/v1/api-keys' }, []));
  test('apiKeys.create', () => hits((o) => o.project.apiKeys.create({ name: 'ci', scopes: ['read'] }), { method: 'POST', url: '/v1/api-keys', body: { name: 'ci', scopes: ['read'] } }));
  test('apiKeys.revoke', () => hits((o) => o.project.apiKeys.revoke('key_1'), { method: 'DELETE', url: '/v1/api-keys/key_1' }));
  test('flags.set encodes the key', () => hits((o) => o.project.flags.set('channel:sms', { value: true }), { method: 'PUT', url: '/v1/engine/flags/channel%3Asms', body: { value: true } }));
  test('health', () => hits((o) => o.project.health(), { method: 'GET', url: '/v1/engine/health' }));
  test('schema.definition', () => hits((o) => o.schema.definition(), { method: 'GET', url: '/v1/schema' }));
  test('schema.fields', () => hits((o) => o.schema.fields(), { method: 'GET', url: '/v1/schema/fields' }));
  test('schema.events', () => hits((o) => o.schema.events(), { method: 'GET', url: '/v1/schema/events' }, []));
});
