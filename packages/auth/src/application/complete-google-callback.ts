/**
 * Google sent the person back with `code` and `state`. Verify the state, exchange the code with
 * the tenant's client, keep the refresh token encrypted, the granted scopes and the account, and
 * mark the connection active. A grant without gmail.send and gmail.readonly is `reauth_needed`.
 */
import { AuthError } from '../domain/errors.js';
import { GOOGLE_REQUIRED_SCOPES, type AuthDeps } from './deps.js';
import { googleClientFor, requireConnection } from './shared.js';
import { verifyState } from './state-token.js';

export interface CompleteGoogleCallbackInput {
  state: string;
  code: string;
}

export interface CompleteGoogleCallbackResult {
  connectionId: string;
  tenantId: string;
  ownerId: string;
  account: string;
  scopes: string[];
  returnUrl: string | null;
}

export async function completeGoogleCallback(deps: AuthDeps, input: CompleteGoogleCallbackInput): Promise<CompleteGoogleCallbackResult> {
  const state = verifyState(deps.signer, deps.clock, input.state);
  const connection = await requireConnection(deps, state.connectionId);
  if (connection.tenantId !== state.tenantId || connection.ownerId !== state.ownerId) {
    throw new AuthError('INVALID_STATE', 'The OAuth state does not belong to this connection. Start the connection again.', 400);
  }

  const client = await googleClientFor(deps, state.tenantId);
  const grant = await deps.google.exchangeCode(client, input.code, deps.googleRedirectUri);

  const missing = GOOGLE_REQUIRED_SCOPES.filter((s) => !grant.scopes.includes(s));
  if (missing.length > 0) {
    await deps.connections.update(connection.id, { status: 'reauth_needed', scopes: grant.scopes, lastError: `Google did not grant: ${missing.join(', ')}` });
    throw new AuthError('SCOPES_MISSING', 'Google did not grant the Gmail permissions this connection needs. Connect again and allow every box.', 422, { missing });
  }
  if (!grant.refreshToken) {
    await deps.connections.update(connection.id, { status: 'reauth_needed', lastError: 'Google returned no refresh token' });
    throw new AuthError('NO_REFRESH_TOKEN', 'Google returned no refresh token. Connect again; the consent screen must be shown.', 422);
  }

  const account = grant.email ?? connection.account;
  if (!account) {
    throw new AuthError('NO_ACCOUNT', 'Google did not say which account consented. Connect again and allow the email permission.', 422);
  }

  const enc = deps.cipher.encrypt(grant.refreshToken);
  const now = deps.clock.now();
  await deps.connections.update(connection.id, {
    account,
    scopes: grant.scopes,
    secretEnc: enc.ciphertext,
    keyId: enc.keyId,
    status: 'active',
    lastOkAt: now,
    lastError: null,
  });
  deps.tokens.set(connection.id, { accessToken: grant.accessToken, expiresAt: grant.expiresAt });

  return { connectionId: connection.id, tenantId: connection.tenantId, ownerId: connection.ownerId, account, scopes: grant.scopes, returnUrl: state.returnUrl ?? null };
}
