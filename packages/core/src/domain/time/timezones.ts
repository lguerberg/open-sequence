/**
 * Resolving a contact's local time, in order of certainty:
 *
 *   1. contacts.timezone (an IANA zone the client supplied)
 *   2. a zone derived from the phone number (the country when it has one zone, or a NANP area code)
 *   3. the country when it has one zone
 *   4. nothing: email and LinkedIn fall back to the sender's zone; SMS is skipped (no_timezone),
 *      because the recipient-local quiet hours are a legal requirement.
 */
import { parsePhoneNumber } from 'libphonenumber-js';
import { NANP_AREA_CODE_ZONES } from './area-codes.js';

/** Countries that keep one zone for all their populated territory. Multi-zone countries are absent on purpose. */
export const SINGLE_ZONE_COUNTRIES: Readonly<Record<string, string>> = {
  GB: 'Europe/London', IE: 'Europe/Dublin', FR: 'Europe/Paris', DE: 'Europe/Berlin', IT: 'Europe/Rome',
  NL: 'Europe/Amsterdam', BE: 'Europe/Brussels', LU: 'Europe/Luxembourg', CH: 'Europe/Zurich', AT: 'Europe/Vienna',
  SE: 'Europe/Stockholm', NO: 'Europe/Oslo', DK: 'Europe/Copenhagen', FI: 'Europe/Helsinki', PL: 'Europe/Warsaw',
  CZ: 'Europe/Prague', SK: 'Europe/Bratislava', HU: 'Europe/Budapest', RO: 'Europe/Bucharest', BG: 'Europe/Sofia',
  GR: 'Europe/Athens', HR: 'Europe/Zagreb', SI: 'Europe/Ljubljana', RS: 'Europe/Belgrade', EE: 'Europe/Tallinn',
  LV: 'Europe/Riga', LT: 'Europe/Vilnius', IS: 'Atlantic/Reykjavik', MT: 'Europe/Malta', CY: 'Asia/Nicosia',
  TR: 'Europe/Istanbul', IL: 'Asia/Jerusalem', AE: 'Asia/Dubai', SA: 'Asia/Riyadh', QA: 'Asia/Qatar',
  EG: 'Africa/Cairo', ZA: 'Africa/Johannesburg', NG: 'Africa/Lagos', KE: 'Africa/Nairobi', MA: 'Africa/Casablanca',
  IN: 'Asia/Kolkata', SG: 'Asia/Singapore', HK: 'Asia/Hong_Kong', JP: 'Asia/Tokyo', KR: 'Asia/Seoul',
  TW: 'Asia/Taipei', CN: 'Asia/Shanghai', TH: 'Asia/Bangkok', VN: 'Asia/Ho_Chi_Minh', MY: 'Asia/Kuala_Lumpur',
  PH: 'Asia/Manila', PK: 'Asia/Karachi', BD: 'Asia/Dhaka', AR: 'America/Argentina/Buenos_Aires', CO: 'America/Bogota',
  PE: 'America/Lima', UY: 'America/Montevideo', VE: 'America/Caracas', BO: 'America/La_Paz', PY: 'America/Asuncion',
  CR: 'America/Costa_Rica', PA: 'America/Panama', GT: 'America/Guatemala', DO: 'America/Santo_Domingo',
  PR: 'America/Puerto_Rico', JM: 'America/Jamaica',
};

export interface TimezoneInput {
  timezone?: string | null;
  phone?: string | null;
  country?: string | null;
}

export type TimezoneSource = 'contact' | 'phone' | 'country';

export interface ResolvedTimezone {
  zone: string;
  source: TimezoneSource;
}

export function resolveContactTimezone(input: TimezoneInput): ResolvedTimezone | null {
  if (input.timezone && isValidTimezone(input.timezone)) return { zone: input.timezone, source: 'contact' };
  const fromPhone = input.phone ? timezoneFromPhone(input.phone) : null;
  if (fromPhone) return { zone: fromPhone, source: 'phone' };
  const country = input.country?.toUpperCase();
  const fromCountry = country ? SINGLE_ZONE_COUNTRIES[country] : undefined;
  if (fromCountry) return { zone: fromCountry, source: 'country' };
  return null;
}

export function timezoneFromPhone(e164: string): string | null {
  let parsed;
  try {
    parsed = parsePhoneNumber(e164);
  } catch {
    return null;
  }
  if (!parsed || !parsed.isValid()) return null;
  if (parsed.countryCallingCode === '1') {
    const area = parsed.nationalNumber.slice(0, 3);
    return NANP_AREA_CODE_ZONES[area] ?? null;
  }
  const country = parsed.country;
  return country ? (SINGLE_ZONE_COUNTRIES[country] ?? null) : null;
}

export function isValidTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
