export interface GoogleProviderOptions {
  /** Overridden by tests; defaults to Google's public endpoints. */
  gmailBaseUrl?: string;
  calendarBaseUrl?: string;
  fetch?: typeof fetch;
  /** Fetch reply bodies (format=full). Off by default: the engine stores bodies only when the project asks. */
  includeBodies?: boolean;
  now?: () => Date;
}

export const GMAIL_BASE_URL = 'https://gmail.googleapis.com';
export const CALENDAR_BASE_URL = 'https://www.googleapis.com';
