/**
 * Hand-written from docs.attio.com (record query responses, attribute types, list attributes,
 * list statuses) in the shape the API returns: `data[]` of records with `values[slug][]`.
 */

const actor = { type: 'workspace-member', id: '50cf242c-7fa3-4cad-87d0-75b1af71c57b' };
const value = (attribute_type: string, fields: Record<string, unknown>, active_until: string | null = null) => ({
  active_from: '2026-01-01T00:00:00.000000000Z',
  active_until,
  created_by_actor: actor,
  attribute_type,
  ...fields,
});
const status = (title: string, celebration_enabled = false) =>
  value('status', { status: { id: { workspace_id: 'ws', object_id: 'deals', attribute_id: 'stage', status_id: title.toLowerCase() }, title, is_archived: false, target_time_in_status: null, celebration_enabled } });

export const PERSON_ID = 'bf071e1f-6035-429d-b874-d83ea64ea13b';
export const COMPANY_ID = '99a03ff3-0435-47da-95cc-76b2caeb4dab';

export const person = {
  id: { workspace_id: 'ws', object_id: 'people', record_id: PERSON_ID },
  created_at: '2025-11-21T13:22:49.061281000Z',
  web_url: `https://app.attio.com/acme/person/${PERSON_ID}`,
  values: {
    name: [value('personal-name', { first_name: 'Ada', last_name: 'Lovelace', full_name: 'Ada Lovelace' })],
    email_addresses: [
      value('email-address', { original_email_address: 'Ada@acme.com', email_address: 'ada@acme.com', email_domain: 'acme.com', email_root_domain: 'acme.com' }),
      value('email-address', { original_email_address: 'ada@old.example', email_address: 'ada@old.example', email_domain: 'old.example', email_root_domain: 'old.example' }),
    ],
    job_title: [value('text', { value: 'CTO' })],
    company: [value('record-reference', { target_object: 'companies', target_record_id: COMPANY_ID })],
    phone_numbers: [value('phone-number', { original_phone_number: '+14155551234', country_code: 'US', phone_number: '+14155551234' })],
    seniority: [value('select', { option: { id: { option_id: 'exec' }, title: 'Executive', is_archived: false } })],
    last_interaction: [value('interaction', { interaction_type: 'email', interacted_at: '2026-10-01T09:00:00.000000000Z', owner_actor: actor })],
    primary_location: [value('location', { line_1: null, line_2: null, locality: 'London', region: null, postcode: null, country_code: 'GB', latitude: null, longitude: null })],
  },
};

export const company = {
  id: { workspace_id: 'ws', object_id: 'companies', record_id: COMPANY_ID },
  created_at: '2025-10-01T00:00:00.000000000Z',
  web_url: `https://app.attio.com/acme/company/${COMPANY_ID}`,
  values: {
    name: [value('text', { value: 'Acme' })],
    domains: [value('domain', { domain: 'acme.com', root_domain: 'acme.com' })],
    employee_range: [value('select', { option: { id: { option_id: 'r' }, title: '51-200', is_archived: false } })],
    foundation_date: [value('date', { value: '2015-03-02' })],
    is_customer: [value('checkbox', { value: true })],
    rating: [value('rating', { value: 4 })],
    arr: [value('currency', { currency_value: '120000.00', currency_code: 'USD' })],
  },
};

const deal = (record_id: string, created_at: string, name: string, stage: ReturnType<typeof status>, currency_value: string, people: string[] = [PERSON_ID]) => ({
  id: { workspace_id: 'ws', object_id: 'deals', record_id },
  created_at,
  web_url: `https://app.attio.com/acme/deal/${record_id}`,
  values: {
    name: [value('text', { value: name })],
    stage: [stage],
    owner: [value('actor-reference', { referenced_actor_type: 'workspace-member', referenced_actor_id: actor.id })],
    value: [value('currency', { currency_value, currency_code: 'USD' })],
    associated_people: people.map((id) => value('record-reference', { target_object: 'people', target_record_id: id })),
    associated_company: [value('record-reference', { target_object: 'companies', target_record_id: COMPANY_ID })],
  },
});

export const DEAL_OLD_OPEN = deal('d1000000-0000-0000-0000-000000000001', '2026-01-10T00:00:00.000000000Z', 'Pilot', status('In Progress'), '5000.00');
export const DEAL_NEW_OPEN = deal('d1000000-0000-0000-0000-000000000002', '2026-09-01T00:00:00.000000000Z', 'Expansion', status('Lead'), '2500.00');
export const DEAL_WON = deal('d1000000-0000-0000-0000-000000000003', '2026-09-15T00:00:00.000000000Z', 'Renewal', status('Won 🎉', true), '90000.00');
export const DEAL_LOST = deal('d1000000-0000-0000-0000-000000000004', '2026-09-20T00:00:00.000000000Z', 'Upsell', status('Lost'), '99999.00');
/** Linked to the company only, not the person; the union must still count it once. */
export const DEAL_COMPANY_ONLY = deal('d1000000-0000-0000-0000-000000000005', '2026-05-01T00:00:00.000000000Z', 'Services', status('In Progress'), '7000.00', []);

export const dealAttributes = [
  { id: { workspace_id: 'ws', object_id: 'deals', attribute_id: 'a1' }, title: 'Name', api_slug: 'name', type: 'text', is_archived: false },
  { id: { workspace_id: 'ws', object_id: 'deals', attribute_id: 'a2' }, title: 'Deal stage', api_slug: 'stage', type: 'status', is_archived: false },
  { id: { workspace_id: 'ws', object_id: 'deals', attribute_id: 'a3' }, title: 'Deal value', api_slug: 'value', type: 'currency', is_archived: false },
  { id: { workspace_id: 'ws', object_id: 'deals', attribute_id: 'a4' }, title: 'Old field', api_slug: 'old_field', type: 'text', is_archived: true },
];

export const dealStageStatuses = [
  { id: { workspace_id: 'ws', object_id: 'deals', attribute_id: 'a2', status_id: 's1' }, title: 'Lead', is_archived: false, celebration_enabled: false, target_time_in_status: null },
  { id: { workspace_id: 'ws', object_id: 'deals', attribute_id: 'a2', status_id: 's2' }, title: 'In Progress', is_archived: false, celebration_enabled: false, target_time_in_status: null },
  { id: { workspace_id: 'ws', object_id: 'deals', attribute_id: 'a2', status_id: 's3' }, title: 'Won 🎉', is_archived: false, celebration_enabled: true, target_time_in_status: null },
  { id: { workspace_id: 'ws', object_id: 'deals', attribute_id: 'a2', status_id: 's4' }, title: 'Lost', is_archived: false, celebration_enabled: false, target_time_in_status: null },
];
