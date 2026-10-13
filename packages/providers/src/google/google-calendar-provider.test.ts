import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GoogleCalendarProvider } from './google-calendar-provider.js';

const EVENTS = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const tokens = { accessToken: async (id: string) => `tok-${id}` };
const provider = () => new GoogleCalendarProvider(tokens, { now: () => new Date('2026-10-13T10:00:00Z') });
const req = { connectionId: 'con_1', projectId: 'prj_1' };

describe('poll', () => {
  it('emits one booking per non-declined attendee and keeps nothing else', async () => {
    const seen: URL[] = [];
    server.use(
      http.get(EVENTS, ({ request }) => {
        const url = new URL(request.url);
        seen.push(url);
        if (!url.searchParams.get('pageToken')) {
          return HttpResponse.json({
            nextPageToken: 'p2',
            items: [
              {
                id: 'evt_1',
                status: 'confirmed',
                summary: 'Intro call',
                description: 'secret',
                created: '2026-10-12T09:00:00Z',
                start: { dateTime: '2026-10-15T14:00:00+02:00' },
                attendees: [
                  { email: 'Rep@example.com', organizer: true, self: true, responseStatus: 'accepted' },
                  { email: 'Lead@acme.com', responseStatus: 'needsAction' },
                  { email: 'nope@acme.com', responseStatus: 'declined' },
                  { email: 'room@resource.calendar.google.com', resource: true, responseStatus: 'accepted' },
                ],
              },
              { id: 'evt_gone', status: 'cancelled', created: '2026-10-12T09:00:00Z', start: { dateTime: '2026-10-15T14:00:00Z' }, attendees: [{ email: 'x@acme.com' }] },
              { id: 'evt_solo', status: 'confirmed', created: '2026-10-12T09:00:00Z', start: { dateTime: '2026-10-15T14:00:00Z' } },
            ],
          });
        }
        return HttpResponse.json({
          nextSyncToken: 'sync-2',
          items: [{ id: 'evt_2', status: 'tentative', created: '2026-10-13T08:00:00Z', start: { date: '2026-10-20' }, attendees: [{ email: 'two@acme.com', responseStatus: 'tentative' }] }],
        });
      }),
    );
    const { events, cursor } = await provider().poll({ ...req, cursor: null });
    expect(cursor).toBe('sync-2');
    expect(events).toEqual([
      { kind: 'meeting_booked', externalId: 'evt_1:lead@acme.com', occurredAt: new Date('2026-10-12T09:00:00Z'), attendee: 'lead@acme.com', startsAt: new Date('2026-10-15T12:00:00Z') },
      { kind: 'meeting_booked', externalId: 'evt_2:two@acme.com', occurredAt: new Date('2026-10-13T08:00:00Z'), attendee: 'two@acme.com', startsAt: new Date('2026-10-20') },
    ]);
    expect(seen[0]!.searchParams.get('timeMin')).toBe('2026-10-12T10:00:00.000Z');
    expect(seen[0]!.searchParams.get('singleEvents')).toBe('true');
    expect(seen[0]!.searchParams.get('showDeleted')).toBe('false');
    expect(seen[0]!.searchParams.get('syncToken')).toBeNull();
    expect(seen[1]!.searchParams.get('pageToken')).toBe('p2');
  });

  it('uses the sync token on later polls and resets on 410', async () => {
    server.use(
      http.get(EVENTS, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('syncToken')).toBe('sync-2');
        expect(url.searchParams.get('timeMin')).toBeNull();
        return HttpResponse.json({ nextSyncToken: 'sync-3', items: [] });
      }),
    );
    expect(await provider().poll({ ...req, cursor: 'sync-2' })).toEqual({ events: [], cursor: 'sync-3' });

    server.use(http.get(EVENTS, () => HttpResponse.json({ error: { code: 410, message: 'Sync token is no longer valid, a full sync is required.' } }, { status: 410 })));
    expect(await provider().poll({ ...req, cursor: 'sync-3' })).toEqual({ events: [], cursor: null });
  });

  it('surfaces a 401 as credentials_needed and a 5xx as transient', async () => {
    server.use(http.get(EVENTS, () => HttpResponse.json({ error: { code: 401, message: 'Invalid Credentials' } }, { status: 401 })));
    await expect(provider().poll({ ...req, cursor: null })).rejects.toThrow(/^credentials_needed/);
    server.use(http.get(EVENTS, () => HttpResponse.json({ error: { code: 503, message: 'Backend Error' } }, { status: 503 })));
    await expect(provider().poll({ ...req, cursor: null })).rejects.toMatchObject({ status: 503, transient: true });
  });
});
