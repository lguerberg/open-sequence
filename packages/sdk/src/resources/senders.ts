/** Senders: the acting users, their Google connection and their channels (docs section 10.3). */
import type { HttpClient, ListQuery, Page } from '../client.js';
import type { Body, Channel, ConnectionView, GoogleConnectResult, Readiness, Sender, SenderChannel, SenderDetail, Task } from '../types.js';

export type SenderInput = Body<'/v1/senders/{id}', 'put'>;
export type SmsChannelInput = Body<'/v1/senders/{id}/channels/sms', 'put'>;
export type ChannelPatch = Body<'/v1/senders/{id}/channels/{channel}', 'patch'>;
export type GoogleConnectInput = { return_url?: string };
export type SenderTasksQuery = ListQuery & { status?: string; kind?: string };

const enc = encodeURIComponent;

export class Senders {
  constructor(private readonly http: HttpClient) {}

  /** `PUT /v1/senders/{external_id}`: create or update by your own id. Scope admin. */
  upsert(id: string, body: SenderInput): Promise<Sender> {
    return this.http.request({ method: 'PUT', path: `/v1/senders/${enc(id)}`, body });
  }

  /** The sender with channels, readiness and connections. */
  get(id: string): Promise<SenderDetail> {
    return this.http.request({ method: 'GET', path: `/v1/senders/${enc(id)}` });
  }

  list(query: ListQuery = {}): Promise<Page<Sender>> {
    return this.http.list('/v1/senders', query);
  }

  /** Every sender, page after page. */
  listAll(query: ListQuery = {}): AsyncGenerator<Sender, void, undefined> {
    return this.http.paginate('/v1/senders', query);
  }

  /** Which node types this sender can run, and why not. */
  readiness(id: string): Promise<Readiness> {
    return this.http.request({ method: 'GET', path: `/v1/senders/${enc(id)}/readiness` });
  }

  /** Starts the Google consent flow (Gmail + Calendar); the sender opens `auth_url` once. */
  connectGoogle(id: string, body: GoogleConnectInput = {}): Promise<GoogleConnectResult> {
    return this.http.request({ method: 'POST', path: `/v1/senders/${enc(id)}/connections/google`, body });
  }

  connections(id: string): Promise<ConnectionView[]> {
    return this.http.request({ method: 'GET', path: `/v1/senders/${enc(id)}/connections` });
  }

  /** Revokes the Google token; the email channel goes `disconnected`. */
  disconnectGoogle(id: string): Promise<{ disconnected: true }> {
    return this.http.request({ method: 'DELETE', path: `/v1/senders/${enc(id)}/connections/google` });
  }

  /** The sender's Allo user and number; validated against the project's Allo key. */
  setSms(id: string, body: SmsChannelInput): Promise<SenderChannel> {
    return this.http.request({ method: 'PUT', path: `/v1/senders/${enc(id)}/channels/sms`, body });
  }

  /** Limits, opt-in and pause/resume of one channel. */
  patchChannel(id: string, channel: Channel, body: ChannelPatch): Promise<SenderChannel> {
    return this.http.request({ method: 'PATCH', path: `/v1/senders/${enc(id)}/channels/${channel}`, body });
  }

  /** Removes the sms channel; its steps skip from now on. Email is removed by `disconnectGoogle`. */
  deleteChannel(id: string, channel: 'sms'): Promise<{ deleted: true }> {
    return this.http.request({ method: 'DELETE', path: `/v1/senders/${enc(id)}/channels/${channel}` });
  }

  /** Disables the sender: their enrollments pause, nothing is deleted. */
  disable(id: string): Promise<{ disabled: true }> {
    return this.http.request({ method: 'DELETE', path: `/v1/senders/${enc(id)}` });
  }

  /** The sender's tasks; `status` defaults to `open` on the server. */
  tasks(id: string, query: SenderTasksQuery = {}): Promise<Page<Task>> {
    return this.http.list(`/v1/senders/${enc(id)}/tasks`, query);
  }
}
