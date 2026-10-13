import type { ChannelRef, DialerProvider } from '@opensequence/core';
import { requireCredentials, type CredentialSource } from '../credentials.js';
import { KeyedTokenBuckets } from '../token-bucket.js';
import { asString, isRecord } from '../http.js';
import { ALLO_BASE_URL, AlloApiError, AlloClient, unwrapData, unwrapList } from './client.js';
import type { AlloOptions } from './sms.js';

/** Allo power dialer: appends to the sender's queue and reads it back when a `call.completed` webhook was missed. */
export class AlloDialerProvider implements DialerProvider {
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

  private userIdOf(channel: ChannelRef): string {
    const userId = asString(channel.config.allo_user_id);
    if (!userId) throw new Error('CHANNEL_MISCONFIGURED: the sms channel has no allo_user_id, so there is no dialing queue to push to');
    return userId;
  }

  async pushNumbers(req: {
    channel: ChannelRef;
    numbers: Array<{ number: string; name?: string; lastName?: string; company?: string; emails?: string[]; jobTitle?: string }>;
    idempotencyKey: string;
  }): Promise<{ added: number; skipped: Array<{ number: string; reason: string }> }> {
    const client = await this.client(req.channel.projectId);
    const userId = this.userIdOf(req.channel);
    await this.writes.take(req.channel.projectId);
    try {
      const res = unwrapData(
        await client.post('/v2/api/dialing-queues/current/numbers', {
          numbers: req.numbers.map((n) => ({
            number: n.number,
            ...(n.name ? { name: n.name } : {}),
            ...(n.lastName ? { last_name: n.lastName } : {}),
            ...(n.company ? { company: n.company } : {}),
            ...(n.emails?.length ? { emails: n.emails } : {}),
            ...(n.jobTitle ? { job_title: n.jobTitle } : {}),
          })),
          user_id: userId,
        }),
      );
      const body = isRecord(res) ? res : {};
      // `added` is documented as a list; a count is accepted in case Allo ever returns one.
      const added = Array.isArray(body.added) ? body.added.length : typeof body.added === 'number' ? body.added : req.numbers.length;
      const skipped = Array.isArray(body.skipped) ? body.skipped.filter(isRecord).map((s) => ({ number: asString(s.number) ?? '', reason: asString(s.reason) ?? 'UNKNOWN' })) : [];
      return { added, skipped };
    } catch (err) {
      // The number is already in the queue: the idempotent case, which counts as done.
      if (err instanceof AlloApiError && err.code === 'DIALING_QUEUE_APPEND_CONFLICT') return { added: req.numbers.length, skipped: [] };
      throw err;
    }
  }

  async queueState(req: { channel: ChannelRef }): Promise<Array<{ number: string; callId: string | null; status: string; reason?: string }>> {
    const client = await this.client(req.channel.projectId);
    let res: unknown;
    try {
      res = await client.get('/v2/api/dialing-queues/current', { user_id: this.userIdOf(req.channel) });
    } catch (err) {
      if (err instanceof AlloApiError && (err.status === 404 || err.code === 'DIALING_QUEUE_NOT_FOUND')) return [];
      throw err;
    }
    return unwrapList(res).map((entry) => {
      const reason = asString(entry.not_reached_destination_reason);
      return {
        number: asString(entry.number_to) ?? asString(entry.number) ?? '',
        callId: asString(entry.call_id) ?? null,
        status: asString(entry.call_status) ?? 'QUEUED',
        ...(reason ? { reason } : {}),
      };
    });
  }
}
