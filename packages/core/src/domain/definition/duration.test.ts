import { describe, expect, it } from 'vitest';
import { durationToMs, isDuration, parseDuration } from './duration.js';

describe('duration grammar', () => {
  it('parses every unit', () => {
    expect(parseDuration('15m')).toEqual({ amount: 15, unit: 'm' });
    expect(parseDuration('2h')).toEqual({ amount: 2, unit: 'h' });
    expect(parseDuration('3d')).toEqual({ amount: 3, unit: 'd' });
    expect(parseDuration('2bd')).toEqual({ amount: 2, unit: 'bd' });
  });

  it('rejects anything else with a sentence', () => {
    expect(() => parseDuration('2 days')).toThrow('not a duration');
    expect(() => parseDuration('0d')).toThrow('positive');
    expect(() => parseDuration('1w')).toThrow();
    expect(isDuration('0m')).toBe(false);
    expect(isDuration('90m')).toBe(true);
  });

  it('converts fixed units to milliseconds and refuses business days', () => {
    expect(durationToMs({ amount: 1, unit: 'h' })).toBe(3_600_000);
    expect(() => durationToMs({ amount: 1, unit: 'bd' })).toThrow('calendar');
  });
});
