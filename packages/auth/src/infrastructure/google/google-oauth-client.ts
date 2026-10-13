/**
 * Google's OAuth 2.0 endpoints over plain fetch: the consent URL, the code exchange, the refresh,
 * the revoke, and userinfo for the account email. Base URLs are options so tests point them at msw.
 *
 * A dead refresh token (revoked, password changed, six months unused on a test app) comes back as
 * `{ error: 'invalid_grant' }`; it is surfaced as an Error whose message starts with `invalid_grant`
 * so the use cases can mark the connection `credentials_needed`.
 */
import type { OAuthClient, OAuthClientCredentials, OAuthGrant } from '../../domain/ports.js';

export interface GoogleOAuthClientOptions {
  authBaseUrl?: string;
  tokenUrl?: string;
  revokeUrl?: string;
  userinfoUrl?: string;
  fetch?: typeof fetch;
  /** Unix milliseconds; token expiries are computed from it so a frozen test clock stays consistent. */
  now?: () => number;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export class GoogleOAuthClient implements OAuthClient {
  private readonly authBaseUrl: string;
  private readonly tokenUrl: string;
  private readonly revokeUrl: string;
  private readonly userinfoUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  constructor(opts: GoogleOAuthClientOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.authBaseUrl = opts.authBaseUrl ?? 'https://accounts.google.com/o/oauth2/v2/auth';
    this.tokenUrl = opts.tokenUrl ?? 'https://oauth2.googleapis.com/token';
    this.revokeUrl = opts.revokeUrl ?? 'https://oauth2.googleapis.com/revoke';
    this.userinfoUrl = opts.userinfoUrl ?? 'https://www.googleapis.com/oauth2/v3/userinfo';
    this.fetchFn = opts.fetch ?? ((input, init) => fetch(input, init));
  }

  authUrl(params: { clientId: string; redirectUri: string; scopes: string[]; state: string; loginHint?: string }): string {
    const url = new URL(this.authBaseUrl);
    url.searchParams.set('client_id', params.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', params.scopes.join(' '));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('state', params.state);
    if (params.loginHint) url.searchParams.set('login_hint', params.loginHint);
    return url.toString();
  }

  async exchangeCode(client: OAuthClientCredentials, code: string, redirectUri: string): Promise<OAuthGrant> {
    const body = await this.token({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    const accessToken = body.access_token!;
    return {
      refreshToken: body.refresh_token ?? null,
      accessToken,
      expiresAt: this.expiry(body.expires_in),
      scopes: (body.scope ?? '').split(' ').filter((s) => s.length > 0),
      email: await this.email(accessToken),
    };
  }

  async refresh(client: OAuthClientCredentials, refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
    const body = await this.token({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    return { accessToken: body.access_token!, expiresAt: this.expiry(body.expires_in) };
  }

  async revoke(token: string): Promise<void> {
    const res = await this.fetchFn(this.revokeUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
    });
    // Google answers 400 for a token that is already invalid; that is the outcome we wanted.
    if (!res.ok && res.status !== 400) throw new Error(`Google revoke failed with HTTP ${res.status}.`);
  }

  private async token(form: Record<string, string>): Promise<TokenResponse> {
    const res = await this.fetchFn(this.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    });
    const body = (await res.json().catch(() => ({}))) as TokenResponse;
    if (body.error === 'invalid_grant') throw new Error(`invalid_grant: ${body.error_description ?? 'Google no longer accepts this grant.'}`);
    if (!res.ok || !body.access_token) {
      throw new Error(`Google token endpoint failed with HTTP ${res.status}${body.error ? ` (${body.error}: ${body.error_description ?? ''})` : ''}.`);
    }
    return body;
  }

  private async email(accessToken: string): Promise<string | null> {
    const res = await this.fetchFn(this.userinfoUrl, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as { email?: string };
    return body.email ?? null;
  }

  private expiry(expiresIn: number | undefined): Date {
    return new Date(this.now() + (expiresIn ?? 3600) * 1000);
  }
}
