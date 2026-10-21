import type { Deps } from '../deps.js';
import { readToken, type UnsubscribeStatus } from './shared.js';

/** GET /v1/unsubscribes/{token}: what a confirmation page shows. Never applies anything; never throws on a bad token. */
export async function getUnsubscribe(deps: Deps, token: string, projectId?: string): Promise<UnsubscribeStatus> {
  return (await readToken(deps, deps.uow.repos, token, projectId)).status;
}
