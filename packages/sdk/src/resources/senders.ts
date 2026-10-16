/** Senders: the acting users, their Google or SMTP connection and their channels (docs section 10.3). */
import type { HttpClient, ListQuery, Page } from '../client.js';
import type { Body, Channel, ConnectionView, GoogleConnectResult, Readiness, Sender, SenderChannel, SenderDetail, Task } from '../types.js';

export type SenderInput = Body<'/v1/senders/{id}', 'put'>;
export type SmsChannelInput = Body<'/v1/senders/{id}/channels/sms', 'put'>;
export type SmtpChannelInput = Body<'/v1/senders/{id}/channels/email', 'put'>;
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

  /** Revokes the Google token; a Gmail email channel goes `disconnected` (an SMTP one is left alone). */
  disconnectGoogle(id: string): Promise<{ disconnected: true }> {
    return this.http.request({ method: 'DELETE', path: `/v1/senders/${enc(id)}/connections/google` });
  }

  /**
   * Sends from any mailbox over SMTP and reads replies over IMAP (Fastmail, Zoho, iCloud, a Google
   * app password, self-hosted mail). Both logins are checked first; a refusal is a 422 such as
   * `SMTP_AUTH_FAILED`. Replaces the email channel; the passwords are stored encrypted and never returned.
   */
  setSmtp(id: string, body: SmtpChannelInput): Promise<SenderChannel> {
    return this.http.request({ method: 'PUT', path: `/v1/senders/${enc(id)}/channels/email`, body });
  }

  /** The sender's Allo user and number; validated against the project's Allo key. */
  setSms(id: string, body: SmsChannelInput): Promise<SenderChannel> {
    return this.http.request({ method: 'PUT', path: `/v1/senders/${enc(id)}/channels/sms`, body });
  }

  /** Limits, opt-in and pause/resume of one channel. */
  patchChannel(id: string, channel: Channel, body: ChannelPatch): Promise<SenderChannel> {
    return this.http.request({ method: 'PATCH', path: `/v1/senders/${enc(id)}/channels/${channel}`, body });
  }

  /** Removes a channel; its steps skip from now on. Removing email deletes stored SMTP passwords; a Google grant stays until `disconnectGoogle`. */
  deleteChannel(id: string, channel: Channel): Promise<{ deleted: true }> {
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
