import { describe, expect, it } from 'vitest';
import { StaticCredentials, providerFactory, registerProvider, registeredProviders } from './index.js';

describe('provider registry', () => {
  it('registers the built-in adapters and lets a module add one', () => {
    expect(registeredProviders()).toEqual(expect.arrayContaining(['mock', 'allo', 'attio', 'google']));
    const credentials = new StaticCredentials({});
    expect(() => providerFactory('google')({ credentials })).toThrow(/TokenSource/);
    expect(providerFactory('google')({ credentials, tokens: { accessToken: async () => 'tok' } })).toMatchObject({ email: expect.anything(), calendar: expect.anything() });
    expect(providerFactory('allo')({ credentials })).toMatchObject({ sms: expect.anything(), dialer: expect.anything() });
    expect(providerFactory('attio')({ credentials })).toMatchObject({ crm: expect.anything() });
    expect(Object.keys(providerFactory('mock')({ credentials }))).toEqual(expect.arrayContaining(['email', 'sms', 'dialer', 'calendar', 'crm']));
    registerProvider('twilio', () => ({}));
    expect(providerFactory('twilio')({ credentials })).toEqual({});
    expect(() => providerFactory('nope')).toThrow(/PROVIDER_UNKNOWN/);
  });
});
