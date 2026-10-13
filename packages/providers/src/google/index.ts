import { GmailEmailProvider } from './gmail-email-provider.js';
import { GoogleCalendarProvider } from './google-calendar-provider.js';
import type { GoogleProviderOptions } from './options.js';
import type { TokenSource } from './token-source.js';

export { GmailEmailProvider, decodePushNotification } from './gmail-email-provider.js';
export { GoogleCalendarProvider } from './google-calendar-provider.js';
export { GoogleApiError } from './http.js';
export type { GoogleProviderOptions } from './options.js';
export type { TokenSource } from './token-source.js';

export function createGoogleProviders(tokens: TokenSource, opts: GoogleProviderOptions = {}): { email: GmailEmailProvider; calendar: GoogleCalendarProvider } {
  return { email: new GmailEmailProvider(tokens, opts), calendar: new GoogleCalendarProvider(tokens, opts) };
}
