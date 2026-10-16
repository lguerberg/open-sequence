import { registerProvider } from './registry.js';
import { createMockProviders } from './mock/index.js';
import { AlloSmsProvider, AlloDialerProvider, type AlloOptions } from './allo/index.js';
import { AttioCrmProvider, type AttioOptions } from './attio/index.js';
import { createGoogleProviders, type GoogleProviderOptions } from './google/index.js';
import { createSmtpProviders, type SmtpProviderOptions } from './smtp/index.js';

export * from './credentials.js';
export * from './registry.js';
export * from './standard-webhooks.js';
export { TokenBucket, KeyedTokenBuckets } from './token-bucket.js';
export { HttpError } from './http.js';
export * from './mock/index.js';
export * from './allo/index.js';
export * from './attio/index.js';
export * from './google/index.js';
export * from './smtp/index.js';
export { ChannelRoutedEmailProvider } from './email/channel-router.js';

// Built-in adapters register themselves; a module adds its own with `registerProvider`.
registerProvider('mock', ({ options }) => createMockProviders(options ?? {}));
registerProvider('google', ({ tokens, options }) => {
  if (!tokens) throw new Error('PROVIDER_MISCONFIGURED: the google provider needs a TokenSource');
  return createGoogleProviders(tokens, (options ?? {}) as GoogleProviderOptions);
});
registerProvider('smtp', ({ connectionSecrets, options }) => {
  if (!connectionSecrets) throw new Error('PROVIDER_MISCONFIGURED: the smtp provider needs a ConnectionSecretSource');
  return createSmtpProviders(connectionSecrets, (options ?? {}) as SmtpProviderOptions);
});
registerProvider('allo', ({ credentials, options }) => ({
  sms: new AlloSmsProvider(credentials, (options ?? {}) as AlloOptions),
  dialer: new AlloDialerProvider(credentials, (options ?? {}) as AlloOptions),
}));
registerProvider('attio', ({ credentials, options }) => ({ crm: new AttioCrmProvider(credentials, (options ?? {}) as AttioOptions) }));
