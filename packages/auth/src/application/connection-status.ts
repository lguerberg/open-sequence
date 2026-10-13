/**
 * The public view of a connection: account, scopes, status, key id, timestamps. Never the token.
 */
import type { Connection, ConnectionStatus } from '../domain/entities.js';
import { notFound } from '../domain/errors.js';
import type { AuthDeps } from './deps.js';

export interface ConnectionView {
  id: string;
  tenantId: string;
  ownerId: string;
  provider: string;
  account: string | null;
  scopes: string[];
  status: ConnectionStatus;
  keyId: string | null;
  config: Record<string, unknown>;
  lastOkAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function connectionView(c: Connection): ConnectionView {
  return {
    id: c.id,
    tenantId: c.tenantId,
    ownerId: c.ownerId,
    provider: c.provider,
    account: c.account,
    scopes: c.scopes,
    status: c.status,
    keyId: c.keyId,
    config: c.config,
    lastOkAt: c.lastOkAt,
    lastError: c.lastError,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export async function connectionStatus(deps: AuthDeps, connectionId: string): Promise<ConnectionView> {
  const c = await deps.connections.byId(connectionId);
  if (!c) throw notFound('connection', connectionId);
  return connectionView(c);
}
