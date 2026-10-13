import type { DealSelection } from '@opensequence/core';
import { asNumber, asString, isRecord } from '../http.js';
import { firstValue, type AttioRecord } from './flatten.js';

/**
 * Attio's default deal stages are Lead, In Progress, "Won 🎉" and Lost; workspaces rename them.
 * A stage is closed when its title says so or when Attio celebrates it (the won flag).
 */
export const DEFAULT_CLOSED_STAGE_PATTERN = /^(closed|won|lost|churn)/i;

export function stageOf(deal: AttioRecord, slug = 'stage'): { title: string | null; celebrationEnabled: boolean; archived: boolean } {
  const value = firstValue(deal, slug);
  const status = value && isRecord(value.status) ? value.status : null;
  return {
    title: status ? (asString(status.title) ?? null) : null,
    celebrationEnabled: status?.celebration_enabled === true,
    archived: status?.is_archived === true,
  };
}

export function isOpenDeal(deal: AttioRecord, closedPattern: RegExp = DEFAULT_CLOSED_STAGE_PATTERN, stageSlug = 'stage'): boolean {
  const stage = stageOf(deal, stageSlug);
  if (stage.celebrationEnabled) return false;
  if (stage.title === null) return true;
  return !closedPattern.test(stage.title.replace(/[^\p{L}\p{N}\s]/gu, '').trim());
}

export function dealValue(deal: AttioRecord, slug = 'value'): number {
  const value = firstValue(deal, slug);
  return (value && asNumber(value.currency_value)) ?? 0;
}

function createdAt(deal: AttioRecord): number {
  return deal.created_at ? new Date(deal.created_at).getTime() : 0;
}

export function selectDeal(open: AttioRecord[], selection: DealSelection): AttioRecord | null {
  if (open.length === 0) return null;
  switch (selection) {
    case 'newest_open':
      return [...open].sort((a, b) => createdAt(b) - createdAt(a))[0] ?? null;
    case 'highest_value':
      return [...open].sort((a, b) => dealValue(b) - dealValue(a) || createdAt(b) - createdAt(a))[0] ?? null;
    case 'any_open':
      return [...open].sort((a, b) => createdAt(a) - createdAt(b))[0] ?? null;
  }
}

export function dedupeById(records: AttioRecord[]): AttioRecord[] {
  const seen = new Set<string>();
  return records.filter((r) => (seen.has(r.id.record_id) ? false : (seen.add(r.id.record_id), true)));
}
