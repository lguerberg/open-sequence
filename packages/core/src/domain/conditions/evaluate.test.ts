import { describe, expect, it } from 'vitest';
import { evaluate, matches } from './evaluate.js';
import type { FactReader, FactValue } from './facts.js';

const reader = (values: Record<string, FactValue>, failing: string[] = []): FactReader => ({
  async get(field) {
    if (failing.includes(field)) throw new Error('CRM is down');
    return values[field] ?? null;
  },
});

describe('matches', () => {
  it('never matches missing data, even for negative operators', () => {
    expect(matches(null, { field: 'x', op: 'is_not', value: 'a' })).toBe(false);
    expect(matches(null, { field: 'x', op: 'ne', value: 1 })).toBe(false);
    expect(matches(null, { field: 'x', op: 'is_empty' })).toBe(false);
  });

  it('compares case-insensitively for text and numerically for numbers', () => {
    expect(matches('Voicemail', { field: 'x', op: 'is', value: 'voicemail' })).toBe(true);
    expect(matches('12', { field: 'x', op: 'gte', value: 10 })).toBe(true);
    expect(matches('abc', { field: 'x', op: 'contains', value: 'B' })).toBe(true);
    expect(matches(true, { field: 'x', op: 'is_true' })).toBe(true);
    expect(matches('false', { field: 'x', op: 'is_false' })).toBe(true);
  });
});

describe('evaluate', () => {
  const label = () => undefined;

  it('all stops at the first false and records what it read', async () => {
    const r = await evaluate(
      { mode: 'all', rules: [{ field: 'history.last_task_outcome', op: 'is', value: 'voicemail' }, { field: 'attrs.deal.stage', op: 'is', value: 'contacting' }] },
      reader({ 'history.last_task_outcome': 'connected', 'attrs.deal.stage': 'contacting' }),
      label
    );
    expect(r.matched).toBe(false);
    expect(r.facts).toHaveLength(1);
    expect(r.facts[0]).toMatchObject({ field: 'history.last_task_outcome', value: 'connected', rule: 'is voicemail', matched: false });
  });

  it('any stops at the first true', async () => {
    const r = await evaluate(
      { mode: 'any', rules: [{ field: 'a', op: 'is', value: 'x' }, { field: 'b', op: 'is', value: 'y' }] },
      reader({ a: 'x', b: 'y' }),
      label
    );
    expect(r.matched).toBe(true);
    expect(r.facts).toHaveLength(1);
  });

  it('a failed read is recorded as null with the error and does not match', async () => {
    const r = await evaluate({ mode: 'all', rules: [{ field: 'crm.deal.stage', op: 'is', value: 'won' }] }, reader({}, ['crm.deal.stage']), label);
    expect(r.matched).toBe(false);
    expect(r.facts[0]).toMatchObject({ value: null, matched: false, error: 'CRM is down' });
  });
});
