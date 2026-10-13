import type { InboundEvent } from '@opensequence/core';

/** Revives the Date fields of an InboundEvent posted as JSON to the mock hook. */
export function reviveInboundEvent(raw: Record<string, unknown>): InboundEvent {
  const event = { ...raw } as Record<string, unknown>;
  for (const key of ['occurredAt', 'startsAt']) {
    if (typeof event[key] === 'string' || typeof event[key] === 'number') event[key] = new Date(event[key] as string | number);
  }
  if (event.occurredAt === undefined) event.occurredAt = new Date();
  if (typeof event.autoReply === 'object' && event.autoReply !== null) {
    const autoReply = event.autoReply as Record<string, unknown>;
    if (typeof autoReply.until === 'string') autoReply.until = new Date(autoReply.until);
  }
  return event as unknown as InboundEvent;
}

export function parseInboundEvent(rawBody: Buffer): InboundEvent[] {
  const parsed: unknown = JSON.parse(rawBody.toString('utf8'));
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list.map((item) => {
    if (typeof item !== 'object' || item === null || typeof (item as Record<string, unknown>).kind !== 'string') {
      throw new Error('MOCK_EVENT_INVALID: the body must be an InboundEvent object with a "kind"');
    }
    return reviveInboundEvent(item as Record<string, unknown>);
  });
}
