import { describe, expect, it } from 'vitest';
import { addDuration, computeNextAt, isInsideWindow, nextInsideWindow, SMS_WINDOW, stepSendAt } from './timing.js';
import { resolveContactTimezone, timezoneFromPhone } from './timezones.js';

const window = { days: ['mon', 'tue', 'wed', 'thu', 'fri'] as const, from: '08:00', to: '18:00', tz: 'contact' as const };

describe('business days', () => {
  it('skips the weekend in the zone', () => {
    // Friday 2026-10-16 15:00 London -> 2bd -> Tuesday 2026-10-20 15:00 London
    const from = new Date('2026-10-16T14:00:00Z');
    const at = addDuration(from, '2bd', 'Europe/London');
    expect(at.toISOString()).toBe('2026-10-20T14:00:00.000Z');
  });

  it('keeps calendar days as calendar days', () => {
    expect(addDuration(new Date('2026-10-16T14:00:00Z'), '2d', 'Europe/London').toISOString()).toBe('2026-10-18T14:00:00.000Z');
  });
});

describe('send window', () => {
  it('knows when it is inside and outside', () => {
    expect(isInsideWindow(new Date('2026-10-14T10:00:00Z'), [...[window]][0]!, 'Europe/London')).toBe(true); // Wed 11:00 BST
    expect(isInsideWindow(new Date('2026-10-14T18:30:00Z'), window, 'Europe/London')).toBe(false); // 19:30 BST
    expect(isInsideWindow(new Date('2026-10-17T10:00:00Z'), window, 'Europe/London')).toBe(false); // Saturday
  });

  it('moves forward to the next opening, across a weekend and a DST change', () => {
    // Saturday 2026-10-24 10:00 BST; clocks go back on 2026-10-25; Monday 08:00 GMT = 08:00Z
    const at = nextInsideWindow(new Date('2026-10-24T09:00:00Z'), window, 'Europe/London');
    expect(at.toISOString()).toBe('2026-10-26T08:00:00.000Z');
  });

  it('respects the contact zone for the SMS window', () => {
    // 08:00 UTC is 04:00 in New York (not allowed) and 10:00 in Paris (allowed)
    const t = new Date('2026-10-14T08:00:00Z');
    expect(isInsideWindow(t, SMS_WINDOW, 'America/New_York')).toBe(false);
    expect(isInsideWindow(t, SMS_WINDOW, 'Europe/Paris')).toBe(true);
  });
});

describe('computeNextAt', () => {
  it('adds the duration, moves into the window, and jitters forward but stays inside it', () => {
    const now = new Date('2026-10-16T16:30:00Z'); // Friday 17:30 BST
    const at = computeNextAt({ now, duration: '1bd', window, jitter: '15m', zone: 'Europe/London', random: () => 0.5 });
    // +1bd -> Monday 17:30 BST (inside), +7.5 min jitter -> 17:37:30 BST = 16:37:30Z
    expect(at.toISOString()).toBe('2026-10-19T16:37:30.000Z');
  });

  it('without a window it is now plus the duration', () => {
    const now = new Date('2026-10-14T10:00:00Z');
    expect(computeNextAt({ now, duration: '2h', zone: 'UTC', random: () => 0 }).toISOString()).toBe('2026-10-14T12:00:00.000Z');
  });
});

describe('resolving a contact time zone', () => {
  it('prefers the stated zone, then the phone, then a single-zone country', () => {
    expect(resolveContactTimezone({ timezone: 'Asia/Tokyo', phone: '+14155551234', country: 'GB' })).toEqual({ zone: 'Asia/Tokyo', source: 'contact' });
    expect(resolveContactTimezone({ phone: '+14155551234', country: 'US' })).toEqual({ zone: 'America/Los_Angeles', source: 'phone' });
    expect(resolveContactTimezone({ country: 'gb' })).toEqual({ zone: 'Europe/London', source: 'country' });
  });

  it('refuses to guess for a multi-zone country with an unknown area code', () => {
    expect(resolveContactTimezone({ phone: '+18505551234', country: 'US' })).toBeNull(); // 850 is split across zones
    expect(resolveContactTimezone({ country: 'US' })).toBeNull();
    expect(timezoneFromPhone('not a number')).toBeNull();
  });

  it('derives a zone from non-NANP numbers through the country', () => {
    expect(timezoneFromPhone('+442071234567')).toBe('Europe/London');
    expect(timezoneFromPhone('+61212345678')).toBeNull(); // Australia has several zones
  });
});

describe('stepSendAt', () => {
  const zone = 'Europe/London';
  const now = new Date('2026-10-14T09:00:00Z'); // Wed 10:00 BST

  it('rolls jitter on a fresh entry, exactly like computeNextAt', () => {
    expect(stepSendAt({ now, window, jitter: '20m', zone, random: () => 0.6, deferredUntil: null }).toISOString()).toBe('2026-10-14T09:12:00.000Z');
  });

  it('sends now on the wake-up it asked for, without asking for randomness', () => {
    const random = () => {
      throw new Error('jitter must not be rolled again');
    };
    expect(stepSendAt({ now, window, jitter: '20m', zone, random, deferredUntil: now })).toEqual(now);
  });

  it('treats a wake-up well before its time as a fresh entry', () => {
    const deferredUntil = new Date(now.getTime() + 10 * 60_000);
    expect(stepSendAt({ now, window, jitter: '20m', zone, random: () => 0.5, deferredUntil }).toISOString()).toBe('2026-10-14T09:10:00.000Z');
  });

  it('pushes a due wake-up outside the window into it, with one roll', () => {
    const sat = new Date('2026-10-17T10:00:00Z');
    expect(stepSendAt({ now: sat, window, jitter: '20m', zone, random: () => 0.5, deferredUntil: new Date('2026-10-16T09:00:00Z') }).toISOString()).toBe('2026-10-19T07:10:00.000Z');
  });
});
