import { asNumber, asString, isRecord } from '../http.js';

/**
 * An Attio record as the query endpoint returns it: `values[slug]` is a list of value objects whose
 * shape depends on the attribute type (docs.attio.com/rest-api/attribute-types/*).
 */
export interface AttioRecord {
  id: { workspace_id?: string; object_id?: string; record_id: string };
  created_at?: string;
  web_url?: string;
  values: Record<string, unknown>;
}

export function asAttioRecord(raw: unknown): AttioRecord | null {
  if (!isRecord(raw) || !isRecord(raw.id) || typeof raw.id.record_id !== 'string') return null;
  return {
    id: { record_id: raw.id.record_id, ...(asString(raw.id.workspace_id) ? { workspace_id: raw.id.workspace_id as string } : {}), ...(asString(raw.id.object_id) ? { object_id: raw.id.object_id as string } : {}) },
    ...(asString(raw.created_at) ? { created_at: raw.created_at as string } : {}),
    ...(asString(raw.web_url) ? { web_url: raw.web_url as string } : {}),
    values: isRecord(raw.values) ? raw.values : {},
  };
}

/** The one scalar a condition can compare, per attribute type. */
export function scalarOf(value: unknown): unknown {
  if (!isRecord(value)) return value ?? null;
  // Per-type keys, in the order the docs define them. The first present one wins.
  if ('status' in value && isRecord(value.status)) return asString(value.status.title) ?? null;
  if ('option' in value && isRecord(value.option)) return asString(value.option.title) ?? null;
  if ('currency_value' in value) return asNumber(value.currency_value) ?? null;
  if ('email_address' in value) return asString(value.email_address) ?? null;
  if ('domain' in value) return asString(value.domain) ?? null;
  if ('full_name' in value) return asString(value.full_name) ?? null;
  if ('phone_number' in value) return asString(value.phone_number) ?? null;
  if ('target_record_id' in value) return asString(value.target_record_id) ?? null;
  if ('referenced_actor_id' in value) return asString(value.referenced_actor_id) ?? null;
  if ('interacted_at' in value) return asString(value.interacted_at) ?? null;
  if ('line_1' in value || 'locality' in value || 'country_code' in value) {
    return [value.line_1, value.locality, value.region, value.country_code].filter((part) => typeof part === 'string' && part).join(', ') || null;
  }
  if ('value' in value) return value.value ?? null;
  return null;
}

/** First active value per attribute slug, as a scalar, plus the record id and timestamps. */
export function flattenRecord(record: AttioRecord): Record<string, unknown> {
  const out: Record<string, unknown> = { id: record.id.record_id };
  if (record.created_at) out.created_at = record.created_at;
  if (record.web_url) out.web_url = record.web_url;
  for (const [slug, values] of Object.entries(record.values)) {
    const list = Array.isArray(values) ? values : [values];
    const active = list.find((v) => !isRecord(v) || v.active_until === null || v.active_until === undefined) ?? list[0];
    out[slug] = active === undefined ? null : scalarOf(active);
  }
  return out;
}

/** The first active value object of an attribute, untouched (for stage flags like celebration_enabled). */
export function firstValue(record: AttioRecord, slug: string): Record<string, unknown> | null {
  const values = record.values[slug];
  const list = Array.isArray(values) ? values : [values];
  const active = list.find((v) => isRecord(v) && (v.active_until === null || v.active_until === undefined)) ?? list[0];
  return isRecord(active) ? active : null;
}
