/** Project settings, provider credentials (write-only), API keys, kill switches and engine health (docs section 10.2). */
import type { HttpClient } from '../client.js';
import type { AlloNumber, AlloUser, ApiKeySummary, Body, CreatedApiKey, CredentialView, CrmSchema, EngineHealth, Project, ProjectSettings, ProjectView } from '../types.js';

export type Provider = 'allo' | 'attio' | 'mock';
/** Allo: `{ api_key, webhook_secret? }`. Attio: `{ api_key }`. Probed before it is accepted (`INVALID_CREDENTIAL`). */
export type ProviderCredentialInput = Record<string, string>;
export type CreateApiKeyInput = Body<'/v1/api-keys', 'post'>;

const enc = encodeURIComponent;

export class ApiKeys {
  constructor(private readonly http: HttpClient) {}

  /** Keys with prefix only, never the secret. */
  list(): Promise<ApiKeySummary[]> {
    return this.http.request({ method: 'GET', path: '/v1/api-keys' });
  }

  /** The secret is in the response once. */
  create(body: CreateApiKeyInput): Promise<CreatedApiKey> {
    return this.http.request({ method: 'POST', path: '/v1/api-keys', body });
  }

  revoke(id: string): Promise<{ revoked: true }> {
    return this.http.request({ method: 'DELETE', path: `/v1/api-keys/${enc(id)}` });
  }
}

export class Flags {
  constructor(private readonly http: HttpClient) {}

  /** Flip a kill switch: `global`, or `channel:<name>`. Audited. */
  set(key: string, body: { value: boolean }): Promise<{ key: string; value: boolean }> {
    return this.http.request({ method: 'PUT', path: `/v1/engine/flags/${enc(key)}`, body });
  }
}

export class ProjectResource {
  readonly apiKeys: ApiKeys;
  readonly flags: Flags;

  constructor(private readonly http: HttpClient) {
    this.apiKeys = new ApiKeys(http);
    this.flags = new Flags(http);
  }

  /** The project, its settings, credential status per provider and the webhook URLs to register at providers. */
  get(): Promise<ProjectView> {
    return this.http.request({ method: 'GET', path: '/v1/project' });
  }

  /** Merged into the current settings. */
  updateSettings(body: ProjectSettings): Promise<Project> {
    return this.http.request({ method: 'PUT', path: '/v1/project/settings', body });
  }

  /** Stores or rotates a provider credential. Secrets are never returned. */
  setProvider(provider: Provider, body: ProviderCredentialInput): Promise<CredentialView> {
    return this.http.request({ method: 'PUT', path: `/v1/project/providers/${provider}`, body });
  }

  alloNumbers(): Promise<AlloNumber[]> {
    return this.http.request({ method: 'GET', path: '/v1/project/providers/allo/numbers' });
  }

  alloUsers(): Promise<AlloUser[]> {
    return this.http.request({ method: 'GET', path: '/v1/project/providers/allo/users' });
  }

  /** Attio objects and attributes, for `crm.*` condition pickers. */
  attioSchema(): Promise<CrmSchema> {
    return this.http.request({ method: 'GET', path: '/v1/project/providers/attio/schema' });
  }

  /** This project's flags, queue depths and job state. Scope admin. */
  health(): Promise<EngineHealth> {
    return this.http.request({ method: 'GET', path: '/v1/engine/health' });
  }
}
