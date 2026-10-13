import type { ChannelRef, InboundEvent, SmsProvider } from '@opensequence/core';
import { requireCredentials, type CredentialSource } from '../credentials.js';
import { KeyedTokenBuckets } from '../token-bucket.js';
import { asDate, asString, isRecord } from '../http.js';
import { ALLO_BASE_URL, AlloApiError, AlloClient, unwrapList } from './client.js';
import { scopesOf } from './probe.js';
import { verifyAlloWebhook } from './webhook.js';

export interface AlloOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Allo allows 5 writes a second per key; the bucket is per project. */
  writesPerSecond?: number;
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Allo SMS: `POST /v1/api/sms` from the sender's number; inbound and delivery through signed webhooks. */
export class AlloSmsProvider implements SmsProvider {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly writes: KeyedTokenBuckets;

  constructor(
    private readonly credentials: CredentialSource,
    opts: AlloOptions = {},
  ) {
    this.baseUrl = opts.baseUrl ?? ALLO_BASE_URL;
    this.fetchImpl = opts.fetch ?? fetch;
    this.writes = new KeyedTokenBuckets(opts.writesPerSecond ?? 5);
  }

  private async client(projectId: string): Promise<AlloClient> {
    const { api_key } = await requireCredentials(this.credentials, projectId, 'allo');
    if (!api_key) throw new Error('CREDENTIALS_MISSING: the allo credential has no api_key');
    return new AlloClient(api_key, this.baseUrl, this.fetchImpl);
  }

  async send(req: { channel: ChannelRef; to: string; body: string; idempotencyKey: string }): Promise<{ providerId: string | null }> {
    const client = await this.client(req.channel.projectId);
    await this.writes.take(req.channel.projectId);
    // The response carries no message id; the `sms.sent` webhook brings it later.
    await client.post('/v1/api/sms', { from: req.channel.address, to: req.to, message: req.body });
    return { providerId: null };
  }

  async findSent(req: { channel: ChannelRef; to: string; body: string; since: Date }): Promise<{ providerId: string } | null> {
    const client = await this.client(req.channel.projectId);
    const until = new Date(Math.max(Date.now(), req.since.getTime()) + 24 * 60 * 60 * 1000);
    // Body shape per Allo's OpenAPI ItemSearchRequest: a `date` range object and a DATE_DESC sort.
    const res = await client.post('/v2/api/conversations/items/search', {
      contact_number: req.to,
      allo_number: req.channel.address,
      type: 'SMS',
      direction: 'OUTBOUND',
      date: { from: dateOnly(req.since), to: dateOnly(until) },
      sort: 'DATE_DESC',
      size: 100,
    });
    const items = unwrapList(res)
      .filter((item) => asString(item.content) === req.body && (item.direction === undefined || item.direction === 'OUTBOUND'))
      .map((item) => ({ id: asString(item.id), at: asDate(item.date) ?? asDate(item.sent_at) ?? asDate(item.start_date) ?? asDate(item.created_at) ?? new Date(0) }))
      .filter((item): item is { id: string; at: Date } => !!item.id && item.at >= req.since)
      .sort((a, b) => b.at.getTime() - a.at.getTime());
    return items[0] ? { providerId: items[0].id } : null;
  }

  async verifyWebhook(req: { projectId: string; headers: Record<string, string | string[] | undefined>; rawBody: Buffer; secret: string }): Promise<InboundEvent[]> {
    return verifyAlloWebhook({ headers: req.headers, rawBody: req.rawBody, secret: req.secret });
  }

  async listNumbers(projectId: string) {
    const client = await this.client(projectId);
    return unwrapList(await client.get('/v2/api/numbers'))
      .filter((n) => typeof n.number === 'string' && n.number)
      .map((n) => ({
        address: n.number as string,
        ref: asString(n.id) ?? (n.number as string),
        country: asString(n.country) ?? '',
        capabilities: Array.isArray(n.capabilities) ? n.capabilities.filter((c): c is string => typeof c === 'string') : [],
        users: (Array.isArray(n.users) ? n.users.filter(isRecord) : []).map(mapUser),
        ...(asString(n.name) ? { name: asString(n.name) as string } : {}),
      }));
  }

  async listUsers(projectId: string): Promise<Array<{ id: string; email: string; name: string }>> {
    const client = await this.client(projectId);
    return unwrapList(await client.get('/v2/api/users')).map(mapUser);
  }

  async health(channel: ChannelRef): Promise<'active' | 'credentials_needed' | 'restricted'> {
    let client: AlloClient;
    try {
      client = await this.client(channel.projectId);
    } catch {
      return 'credentials_needed';
    }
    try {
      const me = await client.get('/v2/api/me');
      const scopes = scopesOf(me);
      return scopes.length > 0 && !scopes.includes('SMS_SEND') ? 'restricted' : 'active';
    } catch (err) {
      if (err instanceof AlloApiError && (err.status === 401 || err.status === 403)) return 'credentials_needed';
      throw err;
    }
  }
}

function mapUser(u: Record<string, unknown>): { id: string; email: string; name: string } {
  return { id: asString(u.id) ?? '', email: asString(u.email) ?? '', name: asString(u.name) ?? '' };
}
