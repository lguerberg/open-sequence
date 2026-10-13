/**
 * Where the Google adapters get an access token. The auth module implements it (section 3.2:
 * it holds the refresh token, caches the access token per connection and refreshes it); the
 * adapters only ever see a short-lived bearer token and never a table or a refresh token.
 */
export interface TokenSource {
  accessToken(connectionId: string): Promise<string>;
}
