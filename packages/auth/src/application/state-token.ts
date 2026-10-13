/**
 * The OAuth `state`: base64url(JSON {tenantId, ownerId, connectionId, returnUrl?, exp}) + '.' + HMAC.
 * Ten minutes is long enough to pick an account and short enough that a leaked URL is useless.
 */
import type { Clock, Signer } from '../domain/ports.js';
import { AuthError } from '../domain/errors.js';

export const STATE_TTL_MS = 10 * 60 * 1000;

export interface StatePayload {
  tenantId: string;
  ownerId: string;
  connectionId: string;
  returnUrl?: string;
  /** Unix milliseconds. */
  exp: number;
}

export function signState(signer: Signer, clock: Clock, payload: Omit<StatePayload, 'exp'>): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: clock.now().getTime() + STATE_TTL_MS }), 'utf8').toString('base64url');
  return `${body}.${signer.sign(body)}`;
}

export function verifyState(signer: Signer, clock: Clock, state: string): StatePayload {
  const dot = state.lastIndexOf('.');
  if (dot <= 0) throw new AuthError('INVALID_STATE', 'The OAuth state is malformed. Start the connection again.', 400);
  const body = state.slice(0, dot);
  const signature = state.slice(dot + 1);
  if (!signer.verify(body, signature)) throw new AuthError('INVALID_STATE', 'The OAuth state signature does not match. Start the connection again.', 400);
  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload;
  } catch {
    throw new AuthError('INVALID_STATE', 'The OAuth state is malformed. Start the connection again.', 400);
  }
  if (typeof payload.exp !== 'number' || payload.exp < clock.now().getTime()) {
    throw new AuthError('STATE_EXPIRED', 'The OAuth state expired (it lasts ten minutes). Start the connection again.', 400);
  }
  return payload;
}
