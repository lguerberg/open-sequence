/**
 * The duration grammar: `^\d+(m|h|d|bd)$`.
 *
 *   m   minutes
 *   h   hours
 *   d   calendar days
 *   bd  business days (Monday to Friday in the contact's time zone; holidays are not modelled)
 *
 * One grammar everywhere: waits, task due and expiry, jitter, timeouts.
 */
export const DURATION_PATTERN = /^(\d+)(m|h|d|bd)$/;

export type DurationUnit = 'm' | 'h' | 'd' | 'bd';

export interface Duration {
  readonly amount: number;
  readonly unit: DurationUnit;
}

export function parseDuration(text: string): Duration {
  const m = DURATION_PATTERN.exec(text);
  if (!m) throw new Error(`"${text}" is not a duration. Use a number and m, h, d or bd, like 2bd.`);
  const amount = Number(m[1]);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(`"${text}" is not a duration: the number must be a positive integer.`);
  }
  return { amount, unit: m[2] as DurationUnit };
}

export function isDuration(text: unknown): text is string {
  return typeof text === 'string' && DURATION_PATTERN.test(text) && Number(DURATION_PATTERN.exec(text)![1]) > 0;
}

/** Milliseconds for the fixed units. Business days need a calendar and a time zone (see timing). */
export function durationToMs(d: Duration): number {
  switch (d.unit) {
    case 'm':
      return d.amount * 60_000;
    case 'h':
      return d.amount * 3_600_000;
    case 'd':
      return d.amount * 86_400_000;
    case 'bd':
      throw new Error('business days are calendar-dependent; use addDuration from the timing module');
  }
}
