/**
 * Builds the Google consent URL for an owner: the tenant's client id, the Gmail and Calendar
 * scopes, `access_type=offline` + `prompt=consent` so a refresh token is issued every time, and a
 * signed, ten-minute `state` naming the tenant, owner and connection row. The row is created
 * `pending` on the first attempt and reused afterwards (one connection per owner and provider).
 */
import { GOOGLE_PROVIDER, GOOGLE_REQUESTED_SCOPES, type AuthDeps } from './deps.js';
import { googleClientFor } from './shared.js';
import { signState } from './state-token.js';

export interface StartGoogleConnectInput {
  tenantId: string;
  ownerId: string;
  /** Where the host sends the person after the callback; carried in the state, not stored. */
  returnUrl?: string;
  /** Pre-selects the Google account on the consent screen. */
  loginHint?: string;
}

export interface StartGoogleConnectResult {
  authUrl: string;
  connectionId: string;
}

export async function startGoogleConnect(deps: AuthDeps, input: StartGoogleConnectInput): Promise<StartGoogleConnectResult> {
  const client = await googleClientFor(deps, input.tenantId);

  let connection = await deps.connections.byOwnerAndProvider(input.ownerId, GOOGLE_PROVIDER);
  if (!connection) {
    connection = await deps.connections.create({
      id: deps.ids.next('connection'),
      tenantId: input.tenantId,
      ownerId: input.ownerId,
      provider: GOOGLE_PROVIDER,
      account: null,
      scopes: [],
      secretEnc: null,
      keyId: null,
      status: 'pending',
      config: {},
      lastOkAt: null,
      lastError: null,
    });
  } else if (connection.status === 'disconnected') {
    connection = await deps.connections.update(connection.id, { status: 'pending', lastError: null });
  }

  const state = signState(deps.signer, deps.clock, {
    tenantId: input.tenantId,
    ownerId: input.ownerId,
    connectionId: connection.id,
    ...(input.returnUrl ? { returnUrl: input.returnUrl } : {}),
  });

  const authUrl = deps.google.authUrl({
    clientId: client.clientId,
    redirectUri: deps.googleRedirectUri,
    scopes: GOOGLE_REQUESTED_SCOPES,
    state,
    ...(input.loginHint ? { loginHint: input.loginHint } : {}),
  });
  return { authUrl, connectionId: connection.id };
}
