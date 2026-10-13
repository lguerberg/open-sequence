import type { InboundEvent } from '@opensequence/core';
import { verifyStandardWebhook, type WebhookHeaders } from '../standard-webhooks.js';
import { asDate, asNumber, asString, isRecord } from '../http.js';

/** Carrier opt-out keywords; a reply made only of one of these is an opt-out, not a reply. */
export const SMS_STOP_WORDS = new Set(['STOP', 'QUIT', 'END', 'CANCEL', 'UNSUBSCRIBE', 'OPT OUT', 'STOPALL']);

export function isStopWord(content: string | undefined): boolean {
  return !!content && SMS_STOP_WORDS.has(content.trim().toUpperCase().replace(/\s+/g, ' '));
}

/** Verifies the Standard Webhooks signature and maps Allo's envelope `{topic, version, timestamp, data}` to InboundEvents. */
export function verifyAlloWebhook(req: { headers: WebhookHeaders; rawBody: Buffer; secret: string; now?: Date }): InboundEvent[] {
  const { id, timestamp } = verifyStandardWebhook({ headers: req.headers, rawBody: req.rawBody, secret: req.secret, ...(req.now ? { now: req.now } : {}) });
  const envelope: unknown = JSON.parse(req.rawBody.toString('utf8'));
  if (!isRecord(envelope)) return [];
  const topic = asString(envelope.topic);
  const data = isRecord(envelope.data) ? envelope.data : {};
  const fallbackAt = asDate(envelope.timestamp) ?? timestamp;
  return mapAlloEvent(topic, data, id, fallbackAt);
}

export function mapAlloEvent(topic: string | undefined, data: Record<string, unknown>, webhookId: string, fallbackAt: Date): InboundEvent[] {
  switch (topic) {
    case 'sms.received': {
      const from = asString(data.from_number) ?? '';
      const to = asString(data.to_number) ?? '';
      const body = asString(data.content);
      const occurredAt = asDate(data.sent_at) ?? fallbackAt;
      if (isStopWord(body)) return [{ kind: 'opt_out', channel: 'sms', externalId: webhookId, occurredAt, from, to }];
      return [{ kind: 'reply', channel: 'sms', externalId: webhookId, occurredAt, from, to, ...(body !== undefined ? { body } : {}) }];
    }
    case 'sms.sent': {
      const body = asString(data.content);
      return [
        {
          kind: 'sent',
          channel: 'sms',
          // The message id, not the delivery id: the executor patches the run's provider_ref with it.
          externalId: asString(data.id) ?? webhookId,
          occurredAt: asDate(data.sent_at) ?? fallbackAt,
          from: asString(data.from_number) ?? '',
          to: asString(data.to_number) ?? '',
          ...(body !== undefined ? { body } : {}),
        },
      ];
    }
    case 'call.completed': {
      const userEmail = asString(data.user_email);
      const summary = asString(data.summary);
      const durationMinutes = asNumber(data.length_in_minutes);
      return [
        {
          kind: 'call_completed',
          externalId: asString(data.id) ?? webhookId,
          occurredAt: asDate(data.start_date) ?? fallbackAt,
          from: asString(data.from_number) ?? '',
          to: asString(data.to) ?? asString(data.to_number) ?? '',
          direction: data.type === 'OUTBOUND' ? 'outbound' : 'inbound',
          result: asString(data.result) ?? 'UNKNOWN',
          ...(userEmail !== undefined ? { userEmail } : {}),
          ...(summary !== undefined ? { summary } : {}),
          ...(durationMinutes !== undefined ? { durationMinutes } : {}),
        },
      ];
    }
    default:
      return [];
  }
}
