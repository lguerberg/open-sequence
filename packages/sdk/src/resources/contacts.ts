/** Contacts: upsert, batch, patch, consent, status, timeline, client events, delete (docs section 10.4). */
import type { HttpClient, ListQuery, Page } from '../client.js';
import type { Body, Contact, ContactDetail, ContactStatus, DateInput, ReportedEvent, TimelineItem } from '../types.js';

export type ContactInput = Body<'/v1/contacts/{id}', 'put'>;
export type ContactWithExternalId = ContactInput & { external_id: string };
export type ContactListQuery = ListQuery & { email?: string; external_id?: string };

/** What the service cannot see: a meeting booked, an opt-out, a suppression or a reply seen in another tool. Idempotent by `id`. */
export type ClientEvent = Omit<Body<'/v1/contacts/{id}/events', 'post'>, 'occurred_at'> & { occurred_at?: DateInput };
export type ClientEventForContact = ClientEvent & { contact: string };
export type SmsConsentInput = { consent: boolean; source?: string; at?: DateInput };

const enc = encodeURIComponent;

export class Contacts {
  constructor(private readonly http: HttpClient) {}

  /** `PUT /v1/contacts/{external_id}`: create or update by your own id; `attrs` are deep-merged. */
  upsert(id: string, body: ContactInput): Promise<Contact> {
    return this.http.request({ method: 'PUT', path: `/v1/contacts/${enc(id)}`, body });
  }

  /** `POST /v1/contacts:batch`: upsert up to 500 contacts. */
  batch(contacts: ContactWithExternalId[]): Promise<Contact[]> {
    return this.http.request({ method: 'POST', path: '/v1/contacts:batch', body: { contacts } });
  }

  list(query: ContactListQuery = {}): Promise<Page<Contact>> {
    return this.http.list('/v1/contacts', query);
  }

  listAll(query: ContactListQuery = {}): AsyncGenerator<Contact, void, undefined> {
    return this.http.paginate('/v1/contacts', query);
  }

  /** The contact with suppressions and the active enrollment. */
  get(id: string): Promise<ContactDetail> {
    return this.http.request({ method: 'GET', path: `/v1/contacts/${enc(id)}` });
  }

  /** Messages, signals and tasks, merged and ordered newest first. */
  timeline(id: string): Promise<TimelineItem[]> {
    return this.http.request({ method: 'GET', path: `/v1/contacts/${enc(id)}/timeline` });
  }

  /** Change fields; changing `attrs` is how conditions stay fresh. */
  patch(id: string, body: ContactInput): Promise<Contact> {
    return this.http.request({ method: 'PATCH', path: `/v1/contacts/${enc(id)}`, body });
  }

  /** `POST /v1/contacts:status`: each contact's active enrollment or null, for "in a sequence" badges. Up to 500 ids or external ids. */
  statuses(ids: string[]): Promise<ContactStatus[]> {
    return this.http.request({ method: 'POST', path: '/v1/contacts:status', body: { ids } });
  }

  /** Report one event; becomes a signal that takes effect on every active enrollment of the contact. */
  reportEvent(id: string, event: ClientEvent): Promise<ReportedEvent> {
    return this.http.request({ method: 'POST', path: `/v1/contacts/${enc(id)}/events`, body: event });
  }

  /** `POST /v1/contacts:events`: up to 500 events in one call, each naming its `contact`. */
  reportEvents(events: ClientEventForContact[]): Promise<Array<ReportedEvent & { id: string }>> {
    return this.http.request({ method: 'POST', path: '/v1/contacts:events', body: { events } });
  }

  /** Records SMS consent. Scope admin. */
  setSmsConsent(id: string, body: SmsConsentInput): Promise<Contact> {
    return this.http.request({ method: 'PUT', path: `/v1/contacts/${enc(id)}/sms-consent`, body });
  }

  /** Erases the contact and everything attached (privacy requests). Scope admin. */
  delete(id: string): Promise<{ deleted: true }> {
    return this.http.request({ method: 'DELETE', path: `/v1/contacts/${enc(id)}` });
  }
}
