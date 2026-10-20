import type { ProviderSet } from '@opensequence/core';
import { MockProviders, type MockProviderOptions } from './state.js';
import { MockEmailProvider } from './email.js';
import { MockSmsProvider } from './sms.js';
import { MockDialerProvider } from './dialer.js';
import { MockCrmProvider } from './crm.js';

export { MockProviders, MockEmailProvider, MockSmsProvider, MockDialerProvider, MockCrmProvider };
export type { MockProviderOptions, MockCrmData, MockCrmRecord, OutboxEntry, DialerPush } from './state.js';
export { parseInboundEvent, reviveInboundEvent } from './events.js';

/** Every port over one in-memory state; `mock` is the handle for the dev hook and the tests. */
export function createMockProviders(opts: MockProviderOptions = {}): ProviderSet & { mock: MockProviders } {
  const mock = new MockProviders(opts);
  return {
    mock,
    email: new MockEmailProvider(mock),
    sms: new MockSmsProvider(mock),
    dialer: new MockDialerProvider(mock),
    crm: new MockCrmProvider(mock),
  };
}
