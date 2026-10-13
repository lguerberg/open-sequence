/** Operator endpoints (`SEQ_ADMIN_TOKEN`, not a project key): bootstrap projects and keys, platform-wide health (docs section 10.1). */
import type { HttpClient } from '../client.js';
import type { Body, CreatedApiKey, Project, QueueStat } from '../types.js';

export type CreateProjectInput = Body<'/v1/admin/projects', 'post'>;
export type AdminCreateApiKeyInput = Body<'/v1/admin/projects/{id}/api-keys', 'post'>;

export interface CreatedProject {
  project: Project;
  /** The first admin-scoped key, shown once. */
  api_key: string;
}

export interface PlatformHealth {
  paused: boolean;
  disabled_channels: string[];
  queues: QueueStat[];
  jobs: Record<string, string | null>;
}

const enc = encodeURIComponent;

export class AdminProjects {
  constructor(private readonly http: HttpClient) {}

  /** Creates a project and its first admin key. */
  create(body: CreateProjectInput): Promise<CreatedProject> {
    return this.http.request({ method: 'POST', path: '/v1/admin/projects', body });
  }

  list(): Promise<Project[]> {
    return this.http.request({ method: 'GET', path: '/v1/admin/projects' });
  }

  /** A key for any project, shown once. */
  createApiKey(projectId: string, body: AdminCreateApiKeyInput): Promise<CreatedApiKey> {
    return this.http.request({ method: 'POST', path: `/v1/admin/projects/${enc(projectId)}/api-keys`, body });
  }
}

export class Admin {
  readonly projects: AdminProjects;

  constructor(private readonly http: HttpClient) {
    this.projects = new AdminProjects(http);
  }

  /** Platform-wide queue depths, job state and kill switches. */
  engineHealth(): Promise<PlatformHealth> {
    return this.http.request({ method: 'GET', path: '/v1/admin/engine/health' });
  }
}
