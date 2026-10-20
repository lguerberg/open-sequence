/** Helpers two or more connection use cases share. */
import type { Connection } from '../domain/entities.js';
import { notFound } from '../domain/errors.js';
import type { AuthDeps } from './deps.js';

export async function requireConnection(deps: AuthDeps, connectionId: string): Promise<Connection> {
  const c = await deps.connections.byId(connectionId);
  if (!c) throw notFound('connection', connectionId);
  return c;
}
