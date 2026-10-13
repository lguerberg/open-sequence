import type { AuthDeps } from './deps.js';
import { connectionView, type ConnectionView } from './connection-status.js';

export async function listConnections(deps: AuthDeps, tenantId: string, ownerId?: string): Promise<ConnectionView[]> {
  const rows = await deps.connections.list(tenantId, ownerId);
  return rows.map(connectionView);
}
