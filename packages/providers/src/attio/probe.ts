import { asString, isRecord } from '../http.js';
import { ATTIO_BASE_URL, AttioApiError, AttioClient } from './client.js';

export interface AttioProbeResult {
  ok: boolean;
  workspaceId?: string;
  workspaceName?: string;
  scopes: string[];
  error?: string;
}

/** `GET /v2/self`: an inactive or revoked token answers 200 with `{ active: false }`, a bad one 401. */
export async function attioProbe(apiKey: string, opts: { baseUrl?: string; fetch?: typeof fetch } = {}): Promise<AttioProbeResult> {
  const client = new AttioClient(apiKey, opts.baseUrl ?? ATTIO_BASE_URL, opts.fetch ?? fetch);
  let self: unknown;
  try {
    self = await client.get('/v2/self');
  } catch (err) {
    if (err instanceof AttioApiError && err.isAuth) return { ok: false, scopes: [], error: err.message };
    throw err;
  }
  if (!isRecord(self) || self.active !== true) return { ok: false, scopes: [], error: 'INVALID_CREDENTIAL: the Attio token is not active' };
  const scopes = (asString(self.scope) ?? '').split(/\s+/).filter(Boolean);
  const workspaceId = asString(self.workspace_id);
  const workspaceName = asString(self.workspace_name);
  return { ok: true, scopes, ...(workspaceId ? { workspaceId } : {}), ...(workspaceName ? { workspaceName } : {}) };
}
