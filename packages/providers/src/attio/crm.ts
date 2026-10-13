import type { CrmProvider, CrmSchema, DealSelection } from '@opensequence/core';
import { requireCredentials, type CredentialSource } from '../credentials.js';
import { asString, isRecord } from '../http.js';
import { ATTIO_BASE_URL, AttioApiError, AttioClient, dataList, dataOf } from './client.js';
import { asAttioRecord, flattenRecord, type AttioRecord } from './flatten.js';
import { DEFAULT_CLOSED_STAGE_PATTERN, dedupeById, isOpenDeal, selectDeal } from './deals.js';

export interface AttioOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Stage titles matching this are closed deals; default `/^(closed|won|lost|churn)/i` plus Attio's celebration flag. */
  closedStagePattern?: RegExp;
  /** Schema cache lifetime; default one hour. */
  schemaTtlMs?: number;
  now?: () => number;
}

const OBJECTS = [
  { name: 'person', slug: 'people' },
  { name: 'company', slug: 'companies' },
  { name: 'deal', slug: 'deals' },
] as const;

/**
 * Attio REST API v2, read-only: the person by email, the company by domain, the deals linked to
 * either, then the project's deal selection. Values are flattened so conditions read `crm.deal.stage`.
 */
export class AttioCrmProvider implements CrmProvider {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly closedStagePattern: RegExp;
  private readonly schemaTtlMs: number;
  private readonly now: () => number;
  private readonly schemaCache = new Map<string, { at: number; schema: CrmSchema }>();

  constructor(
    private readonly credentials: CredentialSource,
    opts: AttioOptions = {},
  ) {
    this.baseUrl = opts.baseUrl ?? ATTIO_BASE_URL;
    this.fetchImpl = opts.fetch ?? fetch;
    this.closedStagePattern = opts.closedStagePattern ?? DEFAULT_CLOSED_STAGE_PATTERN;
    this.schemaTtlMs = opts.schemaTtlMs ?? 60 * 60 * 1000;
    this.now = opts.now ?? (() => Date.now());
  }

  private async client(projectId: string): Promise<AttioClient> {
    const { api_key } = await requireCredentials(this.credentials, projectId, 'attio');
    if (!api_key) throw new Error('CREDENTIALS_MISSING: the attio credential has no api_key');
    return new AttioClient(api_key, this.baseUrl, this.fetchImpl);
  }

  async schema(projectId: string): Promise<CrmSchema> {
    const cached = this.schemaCache.get(projectId);
    if (cached && this.now() - cached.at < this.schemaTtlMs) return cached.schema;
    const client = await this.client(projectId);
    const objects: CrmSchema['objects'] = [];
    for (const object of OBJECTS) {
      const attributes = dataList(await client.get(`/v2/objects/${object.slug}/attributes`)).filter((a) => a.is_archived !== true);
      const mapped: CrmSchema['objects'][number]['attributes'] = [];
      for (const attribute of attributes) {
        const slug = asString(attribute.api_slug);
        const type = asString(attribute.type) ?? 'unknown';
        if (!slug) continue;
        const values = await this.optionTitles(client, object.slug, slug, type);
        mapped.push({ slug, label: asString(attribute.title) ?? slug, type, ...(values ? { values } : {}) });
      }
      objects.push({ name: object.name, attributes: mapped });
    }
    const schema = { objects };
    this.schemaCache.set(projectId, { at: this.now(), schema });
    return schema;
  }

  /** Status and select attributes list their options on sub-resources; everything else has none. */
  private async optionTitles(client: AttioClient, object: string, slug: string, type: string): Promise<string[] | undefined> {
    const sub = type === 'status' ? 'statuses' : type === 'select' ? 'options' : null;
    if (!sub) return undefined;
    return dataList(await client.get(`/v2/objects/${object}/attributes/${slug}/${sub}`))
      .filter((o) => o.is_archived !== true)
      .map((o) => asString(o.title))
      .filter((t): t is string => !!t);
  }

  async lookup(req: { projectId: string; email: string | null; domain: string | null; dealSelection: DealSelection }) {
    const client = await this.client(req.projectId);
    const email = req.email?.trim().toLowerCase() || null;
    const domain = req.domain?.trim().toLowerCase() || null;

    const person = email ? await this.queryOne(client, 'people', { email_addresses: { email_address: { $eq: email } } }) : null;
    let company = domain ? await this.queryOne(client, 'companies', { domains: { domain: { $eq: domain } } }) : null;
    if (!company && person) {
      const companyId = asString(flattenRecord(person).company);
      if (companyId) company = await this.getRecord(client, 'companies', companyId);
    }

    const deals: AttioRecord[] = [];
    if (person) deals.push(...(await this.query(client, 'deals', { associated_people: { target_object: 'people', target_record_id: person.id.record_id } })));
    if (company) deals.push(...(await this.query(client, 'deals', { associated_company: { target_object: 'companies', target_record_id: company.id.record_id } })));
    const open = dedupeById(deals).filter((deal) => isOpenDeal(deal, this.closedStagePattern));
    const deal = selectDeal(open, req.dealSelection);

    return {
      person: person ? flattenRecord(person) : null,
      company: company ? flattenRecord(company) : null,
      deal: deal ? flattenRecord(deal) : null,
      openDeals: open.length,
    };
  }

  private async query(client: AttioClient, object: string, filter: Record<string, unknown>, limit = 100): Promise<AttioRecord[]> {
    const res = await client.post(`/v2/objects/${object}/records/query`, { filter, limit, offset: 0 });
    return dataList(res)
      .map(asAttioRecord)
      .filter((r): r is AttioRecord => r !== null);
  }

  private async queryOne(client: AttioClient, object: string, filter: Record<string, unknown>): Promise<AttioRecord | null> {
    return (await this.query(client, object, filter, 1))[0] ?? null;
  }

  private async getRecord(client: AttioClient, object: string, recordId: string): Promise<AttioRecord | null> {
    try {
      const data = dataOf(await client.get(`/v2/objects/${object}/records/${recordId}`));
      return isRecord(data) ? asAttioRecord(data) : null;
    } catch (err) {
      if (err instanceof AttioApiError && err.isNotFound) return null;
      throw err;
    }
  }
}
