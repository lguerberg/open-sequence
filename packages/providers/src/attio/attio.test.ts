import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { StaticCredentials } from '../credentials.js';
import { AttioCrmProvider } from './crm.js';
import { attioProbe } from './probe.js';
import { AttioApiError } from './client.js';
import { flattenRecord, asAttioRecord } from './flatten.js';
import * as fx from './fixtures.js';

const BASE = 'https://attio.test';
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const credentials = new StaticCredentials({ prj_1: { attio: { api_key: 'attio-key' } } });
const crm = (opts: ConstructorParameters<typeof AttioCrmProvider>[1] = {}) => new AttioCrmProvider(credentials, { baseUrl: BASE, ...opts });

type Filter = Record<string, unknown>;
const calls: Array<{ object: string; filter: Filter }> = [];

/** A tiny Attio that answers the query filters the adapter is expected to send. */
function attioServer(over: { people?: unknown[]; companies?: unknown[]; deals?: unknown[] } = {}) {
  const people = over.people ?? [fx.person];
  const companies = over.companies ?? [fx.company];
  const deals = over.deals ?? [fx.DEAL_OLD_OPEN, fx.DEAL_NEW_OPEN, fx.DEAL_WON, fx.DEAL_LOST, fx.DEAL_COMPANY_ONLY];
  calls.length = 0;
  server.use(
    http.post(`${BASE}/v2/objects/:object/records/query`, async ({ request, params }) => {
      expect(request.headers.get('authorization')).toBe('Bearer attio-key');
      const body = (await request.json()) as { filter: Filter; limit: number };
      calls.push({ object: String(params.object), filter: body.filter });
      const f = body.filter as Record<string, Record<string, unknown>>;
      let data: unknown[] = [];
      if (params.object === 'people') {
        const email = (f.email_addresses?.email_address as { $eq: string }).$eq;
        data = people.filter((p) => (p as typeof fx.person).values.email_addresses.some((v) => v.email_address === email));
      } else if (params.object === 'companies') {
        const domain = (f.domains?.domain as { $eq: string }).$eq;
        data = companies.filter((c) => (c as typeof fx.company).values.domains.some((v) => v.domain === domain));
      } else if (params.object === 'deals') {
        const ref = f.associated_people ?? f.associated_company;
        const slug = f.associated_people ? 'associated_people' : 'associated_company';
        data = deals.filter((d) => (d as typeof fx.DEAL_OLD_OPEN).values[slug].some((v) => v.target_record_id === ref?.target_record_id));
      }
      return HttpResponse.json({ data: data.slice(0, body.limit) });
    }),
    http.get(`${BASE}/v2/objects/companies/records/:id`, ({ params }) => {
      const found = companies.find((c) => (c as typeof fx.company).id.record_id === params.id);
      return found ? HttpResponse.json({ data: found }) : HttpResponse.json({ status_code: 404, type: 'invalid_request_error', code: 'not_found', message: 'Record not found' }, { status: 404 });
    }),
  );
}

describe('flattenRecord', () => {
  it('takes the first active value of every attribute as a scalar', () => {
    const person = flattenRecord(asAttioRecord(fx.person)!);
    expect(person).toEqual({
      id: fx.PERSON_ID,
      created_at: '2025-11-21T13:22:49.061281000Z',
      web_url: `https://app.attio.com/acme/person/${fx.PERSON_ID}`,
      name: 'Ada Lovelace',
      email_addresses: 'ada@acme.com',
      job_title: 'CTO',
      company: fx.COMPANY_ID,
      phone_numbers: '+14155551234',
      seniority: 'Executive',
      last_interaction: '2026-10-01T09:00:00.000000000Z',
      primary_location: 'London, GB',
    });
    const company = flattenRecord(asAttioRecord(fx.company)!);
    expect(company).toMatchObject({ name: 'Acme', domains: 'acme.com', employee_range: '51-200', foundation_date: '2015-03-02', is_customer: true, rating: 4, arr: 120000 });
    const deal = flattenRecord(asAttioRecord(fx.DEAL_WON)!);
    expect(deal).toMatchObject({ name: 'Renewal', stage: 'Won 🎉', value: 90000, owner: '50cf242c-7fa3-4cad-87d0-75b1af71c57b', associated_people: fx.PERSON_ID, associated_company: fx.COMPANY_ID });
  });
});

describe('AttioCrmProvider.lookup', () => {
  it('finds the person by email, the company by domain, and the newest open deal across both', async () => {
    attioServer();
    const res = await crm().lookup({ projectId: 'prj_1', email: 'Ada@acme.com', domain: 'acme.com', dealSelection: 'newest_open' });
    expect(res.person).toMatchObject({ id: fx.PERSON_ID, name: 'Ada Lovelace', email_addresses: 'ada@acme.com' });
    expect(res.company).toMatchObject({ id: fx.COMPANY_ID, name: 'Acme', domains: 'acme.com' });
    expect(res.deal).toMatchObject({ name: 'Expansion', stage: 'Lead', value: 2500 });
    // Won (celebrated) and Lost are closed; the company-only deal is counted once.
    expect(res.openDeals).toBe(3);
    expect(calls).toEqual([
      { object: 'people', filter: { email_addresses: { email_address: { $eq: 'ada@acme.com' } } } },
      { object: 'companies', filter: { domains: { domain: { $eq: 'acme.com' } } } },
      { object: 'deals', filter: { associated_people: { target_object: 'people', target_record_id: fx.PERSON_ID } } },
      { object: 'deals', filter: { associated_company: { target_object: 'companies', target_record_id: fx.COMPANY_ID } } },
    ]);
  });

  it('applies highest_value and any_open', async () => {
    attioServer();
    const highest = await crm().lookup({ projectId: 'prj_1', email: 'ada@acme.com', domain: 'acme.com', dealSelection: 'highest_value' });
    expect(highest.deal).toMatchObject({ name: 'Services', value: 7000 });
    const any = await crm().lookup({ projectId: 'prj_1', email: 'ada@acme.com', domain: 'acme.com', dealSelection: 'any_open' });
    expect(any.deal).toMatchObject({ name: 'Pilot' });
  });

  it('falls back to the person\'s company reference when no company matches the domain', async () => {
    attioServer();
    const res = await crm().lookup({ projectId: 'prj_1', email: 'ada@acme.com', domain: 'gmail.com', dealSelection: 'newest_open' });
    expect(res.company).toMatchObject({ id: fx.COMPANY_ID, name: 'Acme' });
  });

  it('returns nulls, never throws, when nothing is found', async () => {
    attioServer({ people: [], companies: [], deals: [] });
    expect(await crm().lookup({ projectId: 'prj_1', email: 'nobody@nowhere.test', domain: 'nowhere.test', dealSelection: 'newest_open' })).toEqual({ person: null, company: null, deal: null, openDeals: 0 });
    expect(await crm().lookup({ projectId: 'prj_1', email: null, domain: null, dealSelection: 'newest_open' })).toEqual({ person: null, company: null, deal: null, openDeals: 0 });
  });

  it('throws on auth errors', async () => {
    server.use(http.post(`${BASE}/v2/objects/people/records/query`, () => HttpResponse.json({ status_code: 401, type: 'authentication_error', code: 'unauthorized', message: 'Invalid token' }, { status: 401 })));
    const err = await crm()
      .lookup({ projectId: 'prj_1', email: 'ada@acme.com', domain: null, dealSelection: 'newest_open' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AttioApiError);
    expect((err as AttioApiError).isAuth).toBe(true);
    await expect(crm().lookup({ projectId: 'prj_missing', email: 'a@b.c', domain: null, dealSelection: 'newest_open' })).rejects.toThrow(/CREDENTIALS_MISSING/);
  });
});

describe('AttioCrmProvider.schema', () => {
  it('lists attributes with status options and caches for an hour', async () => {
    let hits = 0;
    server.use(
      http.get(`${BASE}/v2/objects/:object/attributes`, ({ params }) => {
        hits += 1;
        return HttpResponse.json({ data: params.object === 'deals' ? fx.dealAttributes : [{ api_slug: 'name', title: 'Name', type: 'text', is_archived: false }] });
      }),
      http.get(`${BASE}/v2/objects/deals/attributes/stage/statuses`, () => HttpResponse.json({ data: fx.dealStageStatuses })),
    );
    let now = 0;
    const provider = crm({ now: () => now });
    const schema = await provider.schema('prj_1');
    expect(schema.objects.map((o) => o.name)).toEqual(['person', 'company', 'deal']);
    expect(schema.objects[2]?.attributes).toEqual([
      { slug: 'name', label: 'Name', type: 'text' },
      { slug: 'stage', label: 'Deal stage', type: 'status', values: ['Lead', 'In Progress', 'Won 🎉', 'Lost'] },
      { slug: 'value', label: 'Deal value', type: 'currency' },
    ]);
    expect(hits).toBe(3);
    now = 30 * 60 * 1000;
    await provider.schema('prj_1');
    expect(hits).toBe(3);
    now = 61 * 60 * 1000;
    await provider.schema('prj_1');
    expect(hits).toBe(6);
  });
});

describe('attioProbe', () => {
  it('reads the workspace and scopes from /v2/self', async () => {
    server.use(http.get(`${BASE}/v2/self`, () => HttpResponse.json({ active: true, scope: 'record_permission:read object_configuration:read', workspace_id: 'ws_1', workspace_name: 'Acme' })));
    expect(await attioProbe('k', { baseUrl: BASE })).toEqual({ ok: true, scopes: ['record_permission:read', 'object_configuration:read'], workspaceId: 'ws_1', workspaceName: 'Acme' });
    server.use(http.get(`${BASE}/v2/self`, () => HttpResponse.json({ active: false })));
    expect((await attioProbe('k', { baseUrl: BASE })).ok).toBe(false);
    server.use(http.get(`${BASE}/v2/self`, () => HttpResponse.json({ code: 'unauthorized' }, { status: 401 })));
    expect((await attioProbe('k', { baseUrl: BASE })).ok).toBe(false);
  });
});
