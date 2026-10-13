/**
 * How an adapter gets a project's secrets. The auth module implements this over its encrypted
 * `auth.credentials` table; adapters never read a table themselves.
 *
 * Known shapes: allo → { api_key, webhook_secret }, attio → { api_key }.
 */
export interface CredentialSource {
  credentialsFor(projectId: string, provider: string): Promise<Record<string, string> | null>;
}

export class CredentialsMissingError extends Error {
  readonly code = 'CREDENTIALS_MISSING';
  constructor(
    readonly projectId: string,
    readonly provider: string,
  ) {
    super(`CREDENTIALS_MISSING: project ${projectId} has no ${provider} credential`);
    this.name = 'CredentialsMissingError';
  }
}

/** Fetches a credential and throws a stable error when the project has none. */
export async function requireCredentials(source: CredentialSource, projectId: string, provider: string): Promise<Record<string, string>> {
  const creds = await source.credentialsFor(projectId, provider);
  if (!creds) throw new CredentialsMissingError(projectId, provider);
  return creds;
}

/** A static source for tests and the mock setup. */
export class StaticCredentials implements CredentialSource {
  constructor(private readonly byProjectAndProvider: Record<string, Record<string, Record<string, string>>>) {}
  async credentialsFor(projectId: string, provider: string): Promise<Record<string, string> | null> {
    return this.byProjectAndProvider[projectId]?.[provider] ?? null;
  }
}
