import type { CalendarProvider, InboundEvent } from '@opensequence/core';
import type { MockProviders } from './state.js';

export class MockCalendarProvider implements CalendarProvider {
  constructor(private readonly mock: MockProviders) {}

  async poll(req: { connectionId: string; projectId: string; cursor: string | null }): Promise<{ events: InboundEvent[]; cursor: string | null }> {
    const events = this.mock.drainCalendar(req.projectId);
    return { events, cursor: String(Number(req.cursor ?? '0') + events.length) };
  }

  async watch(): Promise<{ expiresAt: Date }> {
    return { expiresAt: new Date(this.mock.now().getTime() + 7 * 24 * 60 * 60 * 1000) };
  }
}
