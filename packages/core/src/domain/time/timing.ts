/**
 * Timing is computed when a step is entered and re-checked when it runs. Everything here is a
 * pure function of (now, settings, zone, random), so it is unit-tested across weekends, windows
 * and zones without a clock.
 */
import { TZDate } from '@date-fns/tz';
import { addDays, addMilliseconds } from 'date-fns';
import { durationToMs, parseDuration, type Duration } from '../definition/duration.js';
import type { SendWindow, Weekday } from '../definition/schema.js';

const WEEKDAYS: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** The hard window for texts: 08:00 to 21:00 recipient-local, every day. Not configurable. */
export const SMS_WINDOW: SendWindow = {
  days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  from: '08:00',
  to: '21:00',
  tz: 'contact',
};

export function addDuration(from: Date, duration: Duration | string, zone: string): Date {
  const d = typeof duration === 'string' ? parseDuration(duration) : duration;
  if (d.unit !== 'bd') return addMilliseconds(from, durationToMs(d));
  // Business days: step forward one calendar day at a time in the zone, counting weekdays only.
  let cur = new TZDate(from, zone);
  let remaining = d.amount;
  while (remaining > 0) {
    cur = new TZDate(addDays(cur, 1), zone);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return new Date(cur.getTime());
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
}

/** True when `at` is inside the window, in the window's zone. */
export function isInsideWindow(at: Date, window: SendWindow, zone: string): boolean {
  const local = new TZDate(at, zone);
  const day = WEEKDAYS[local.getDay()]!;
  if (!window.days.includes(day)) return false;
  const minutes = local.getHours() * 60 + local.getMinutes();
  return minutes >= minutesOf(window.from) && minutes < minutesOf(window.to);
}

/** The first instant at or after `at` that is inside the window. */
export function nextInsideWindow(at: Date, window: SendWindow, zone: string): Date {
  if (isInsideWindow(at, window, zone)) return at;
  const fromMin = minutesOf(window.from);
  let local = new TZDate(at, zone);
  for (let i = 0; i < 14; i++) {
    const day = WEEKDAYS[local.getDay()]!;
    const minutes = local.getHours() * 60 + local.getMinutes();
    if (window.days.includes(day) && minutes < fromMin) {
      const start = new TZDate(local.getFullYear(), local.getMonth(), local.getDate(), Math.floor(fromMin / 60), fromMin % 60, 0, 0, zone);
      return new Date(start.getTime());
    }
    const next = new TZDate(addDays(local, 1), zone);
    local = new TZDate(next.getFullYear(), next.getMonth(), next.getDate(), 0, 0, 0, 0, zone);
  }
  throw new Error('send window has no open day in the next two weeks');
}

export interface ComputeNextAtInput {
  now: Date;
  duration?: Duration | string;
  window?: SendWindow | undefined;
  jitter?: string | undefined;
  /** The zone the window follows (already resolved: contact or sender). */
  zone: string;
  random: () => number;
}

/**
 * computeNextAt: base = now + duration (business days in the zone), moved forward into the send
 * window, plus random jitter so sends do not burst on the hour.
 */
export function computeNextAt(input: ComputeNextAtInput): Date {
  let at = input.duration ? addDuration(input.now, input.duration, input.zone) : input.now;
  if (input.window) at = nextInsideWindow(at, input.window, input.zone);
  if (input.jitter) {
    const ms = durationToMs(parseDuration(input.jitter));
    at = addMilliseconds(at, Math.floor(input.random() * ms));
    if (input.window && !isInsideWindow(at, input.window, input.zone)) at = nextInsideWindow(at, input.window, input.zone);
  }
  return at;
}

/** How close to now a computed send time must be for the step to send instead of deferring. */
export const SEND_TOLERANCE_MS = 60_000;

export interface StepSendAtInput extends ComputeNextAtInput {
  /**
   * The time this step chose for itself when it last deferred (or its executor deferred it), or
   * null when the step is being entered fresh.
   */
  deferredUntil: Date | null;
}

/**
 * When an outreach step should send. Jitter is rolled once each time the step has to pick a new
 * send time, never on the wake-up that time produced:
 *
 * - Entered fresh: computeNextAt with jitter (the step defers unless the roll is under a minute).
 * - Woken by its own deferral and inside the window: send now, no new roll.
 * - Woken by its own deferral but outside the window (resumed after a pause, the window closed,
 *   or a weekend in between): pushed into the next window with one fresh roll, and the deferral
 *   that produces sends when it fires. The fresh roll keeps resumed enrollments from bursting
 *   on the hour the window opens.
 *
 * The caller sends when the result is within SEND_TOLERANCE_MS of now, and defers otherwise.
 */
export function stepSendAt(input: StepSendAtInput): Date {
  const { deferredUntil, ...rest } = input;
  const resumed = deferredUntil !== null && input.now.getTime() >= deferredUntil.getTime() - SEND_TOLERANCE_MS;
  if (resumed && (!input.window || isInsideWindow(input.now, input.window, input.zone))) return input.now;
  return computeNextAt(rest);
}
