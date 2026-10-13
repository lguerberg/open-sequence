/**
 * Conditions: a list of { field, op, value } combined with all or any. Missing data never matches.
 * Every read is recorded as a FactRecord, which is what the journey shows later.
 */
import { z } from 'zod';
import type { FactFieldSpec, FactType } from '../definition/registry.js';
import type { FactReader, FactRecord, FactValue } from './facts.js';

export const OPERATORS_BY_TYPE: Readonly<Record<FactType, readonly string[]>> = {
  enum: ['is', 'is_not'],
  text: ['is', 'is_not', 'contains', 'is_empty', 'is_not_empty'],
  number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'],
  bool: ['is_true', 'is_false'],
  date: ['before', 'after'],
};

export const ruleSchema = z.object({
  field: z.string().min(1),
  op: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});
export type Rule = z.infer<typeof ruleSchema>;

export const conditionParamsSchema = z.object({
  mode: z.enum(['all', 'any']),
  rules: z.array(ruleSchema).min(1).max(20),
});
export type ConditionParams = z.infer<typeof conditionParamsSchema>;

const UNARY = new Set(['is_empty', 'is_not_empty', 'is_true', 'is_false']);

export function operatorNeedsValue(op: string): boolean {
  return !UNARY.has(op);
}

export function ruleSentence(rule: Rule): string {
  const words: Record<string, string> = {
    is: 'is', is_not: 'is not', contains: 'contains', is_empty: 'is empty', is_not_empty: 'is not empty',
    eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', is_true: 'is true', is_false: 'is false',
    before: 'before', after: 'after',
  };
  const w = words[rule.op] ?? rule.op;
  return UNARY.has(rule.op) ? w : `${w} ${String(rule.value)}`;
}

/** Pure comparison. `null` (missing) never matches any operator, including is_not and ne. */
export function matches(value: FactValue, rule: Rule): boolean {
  if (value === null || value === undefined) return false;
  const v = rule.value;
  switch (rule.op) {
    case 'is':
      return String(value).toLowerCase() === String(v).toLowerCase();
    case 'is_not':
      return String(value).toLowerCase() !== String(v).toLowerCase();
    case 'contains':
      return String(value).toLowerCase().includes(String(v).toLowerCase());
    case 'is_empty':
      return String(value).trim() === '';
    case 'is_not_empty':
      return String(value).trim() !== '';
    case 'is_true':
      return value === true || value === 'true';
    case 'is_false':
      return value === false || value === 'false';
    case 'eq':
      return Number(value) === Number(v);
    case 'ne':
      return Number(value) !== Number(v);
    case 'gt':
      return Number(value) > Number(v);
    case 'gte':
      return Number(value) >= Number(v);
    case 'lt':
      return Number(value) < Number(v);
    case 'lte':
      return Number(value) <= Number(v);
    case 'before':
      return Date.parse(String(value)) < Date.parse(String(v));
    case 'after':
      return Date.parse(String(value)) > Date.parse(String(v));
    default:
      return false;
  }
}

export interface EvaluationResult {
  matched: boolean;
  facts: FactRecord[];
}

/** Lazy: a rule is read only until the outcome is decided (all stops at the first false, any at the first true). */
export async function evaluate(
  params: ConditionParams,
  reader: FactReader,
  label: (field: string) => FactFieldSpec | undefined
): Promise<EvaluationResult> {
  const facts: FactRecord[] = [];
  let outcome = params.mode === 'all';
  for (const rule of params.rules) {
    let value: FactValue = null;
    let error: string | undefined;
    try {
      value = await reader.get(rule.field);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const ok = matches(value, rule);
    const record: FactRecord = {
      field: rule.field,
      label: label(rule.field)?.label ?? rule.field,
      value,
      rule: ruleSentence(rule),
      matched: ok,
    };
    if (error) record.error = error;
    facts.push(record);
    if (params.mode === 'all' && !ok) {
      outcome = false;
      break;
    }
    if (params.mode === 'any' && ok) {
      outcome = true;
      break;
    }
  }
  return { matched: outcome, facts };
}
