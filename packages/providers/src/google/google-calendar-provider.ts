import type { CalendarProvider, InboundEvent } from '@opensequence/core';
import { discard, expectJson, googleRequest, withQuery, type GoogleHttp } from './http.js';
import { CALENDAR_BASE_URL, type GoogleProviderOptions } from './options.js';
import type { TokenSource } from './token-source.js';

interface CalendarEvent {
  id: string;
  status?: string;
  created?: string;
  start?: { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string; organizer?: boolean; self?: boolean; resource?: boolean; responseStatus?: string }>;
}

interface EventsResponse {
  items?: CalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

/**
 * The sender's primary calendar through `events.list` with a sync token. Keeps only the event
 * id, its start and the attendee that matched: never the title, description or anyone else.
 */
export class GoogleCalendarProvider implements CalendarProvider {
  private readonly http: GoogleHttp;
  private readonly base: string;
  private readonly now: () => Date;

  constructor(tokens: TokenSource, opts: GoogleProviderOptions = {}) {
    this.http = { tokens, fetch: opts.fetch ?? globalThis.fetch };
    this.base = `${(opts.calendarBaseUrl ?? CALENDAR_BASE_URL).replace(/\/$/, '')}/calendar/v3/calendars/primary/events`;
    this.now = opts.now ?? (() => new Date());
  }

  async poll(req: { connectionId: string; projectId: string; cursor: string | null }): Promise<{ events: InboundEvent[]; cursor: string | null }> {
    const events: InboundEvent[] = [];
    let pageToken: string | undefined;
    let syncToken: string | undefined;
    do {
      const url = withQuery(this.base, {
        singleEvents: 'true',
        showDeleted: 'false',
        maxResults: '250',
        ...(req.cursor ? { syncToken: req.cursor } : { timeMin: new Date(this.now().getTime() - 24 * 3600 * 1000).toISOString() }),
        pageToken,
      });
      const res = await googleRequest(this.http, req.connectionId, url);
      if (res.status === 410) {
        // The sync token expired: start over from a fresh full read next time.
        await discard(res);
        return { events: [], cursor: null };
      }
      const page = await expectJson<EventsResponse>(res);
      for (const event of page.items ?? []) events.push(...bookings(event));
      pageToken = page.nextPageToken;
      syncToken = page.nextSyncToken ?? syncToken;
    } while (pageToken);
    return { events, cursor: syncToken ?? req.cursor };
  }
}

function bookings(event: CalendarEvent): InboundEvent[] {
  if (event.status === 'cancelled' || !event.attendees?.length) return [];
  const startsAt = event.start?.dateTime ?? event.start?.date;
  if (!startsAt) return [];
  const occurredAt = event.created ? new Date(event.created) : new Date(startsAt);
  const out: InboundEvent[] = [];
  for (const attendee of event.attendees) {
    if (!attendee.email || attendee.organizer || attendee.self || attendee.resource) continue;
    if (attendee.responseStatus === 'declined') continue;
    const email = attendee.email.toLowerCase();
    out.push({ kind: 'meeting_booked', externalId: `${event.id}:${email}`, occurredAt, attendee: email, startsAt: new Date(startsAt) });
  }
  return out;
}
