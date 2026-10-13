import type { CrmProvider, CrmSchema, DealSelection } from '@opensequence/core';
import type { MockProviders } from './state.js';

const DEFAULT_SCHEMA: CrmSchema = {
  objects: [
    {
      name: 'person',
      attributes: [
        { slug: 'name', label: 'Name', type: 'personal-name' },
        { slug: 'email_addresses', label: 'Email', type: 'email-address' },
        { slug: 'job_title', label: 'Job title', type: 'text' },
      ],
    },
    {
      name: 'company',
      attributes: [
        { slug: 'name', label: 'Name', type: 'text' },
        { slug: 'domains', label: 'Domain', type: 'domain' },
      ],
    },
    {
      name: 'deal',
      attributes: [
        { slug: 'name', label: 'Name', type: 'text' },
        { slug: 'stage', label: 'Stage', type: 'status', values: ['Lead', 'In Progress', 'Won 🎉', 'Lost'] },
        { slug: 'value', label: 'Value', type: 'currency' },
      ],
    },
  ],
};

export class MockCrmProvider implements CrmProvider {
  constructor(private readonly mock: MockProviders) {}

  async schema(): Promise<CrmSchema> {
    return this.mock.crm.schema ?? DEFAULT_SCHEMA;
  }

  async lookup(req: { projectId: string; email: string | null; domain: string | null; dealSelection: DealSelection }) {
    const record =
      (req.email ? this.mock.crm.byEmail?.[req.email.toLowerCase()] : undefined) ??
      (req.domain ? this.mock.crm.byDomain?.[req.domain.toLowerCase()] : undefined);
    return {
      person: record?.person ?? null,
      company: record?.company ?? null,
      deal: record?.deal ?? null,
      openDeals: record?.openDeals ?? (record?.deal ? 1 : 0),
    };
  }
}
