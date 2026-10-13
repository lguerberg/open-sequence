import { and, eq } from 'drizzle-orm';
import type { ApiKey, Project } from '../../../domain/entities.js';
import type { ProjectRepository } from '../../../domain/repositories.js';
import type { DbOrTx } from '../db.js';
import { apiKeys, flags, projects } from '../schema.js';

export class DrizzleProjectRepository implements ProjectRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(p: Omit<Project, 'createdAt' | 'updatedAt'>): Promise<Project> {
    const [row] = await this.db.insert(projects).values(p).returning();
    return row!;
  }

  async byId(id: string): Promise<Project | null> {
    return (await this.db.query.projects.findFirst({ where: eq(projects.id, id) })) ?? null;
  }

  async bySlug(slug: string): Promise<Project | null> {
    return (await this.db.query.projects.findFirst({ where: eq(projects.slug, slug) })) ?? null;
  }

  async list(): Promise<Project[]> {
    return this.db.query.projects.findMany({ orderBy: projects.createdAt });
  }

  async updateSettings(id: string, settings: Project['settings']): Promise<Project> {
    const [row] = await this.db.update(projects).set({ settings, updatedAt: new Date() }).where(eq(projects.id, id)).returning();
    return row!;
  }

  async createApiKey(k: Omit<ApiKey, 'createdAt' | 'lastUsedAt' | 'revokedAt'>): Promise<ApiKey> {
    const [row] = await this.db.insert(apiKeys).values(k).returning();
    return row!;
  }

  async apiKeyByHash(hash: string): Promise<ApiKey | null> {
    return (await this.db.query.apiKeys.findFirst({ where: eq(apiKeys.keyHash, hash) })) ?? null;
  }

  async listApiKeys(projectId: string): Promise<ApiKey[]> {
    return this.db.query.apiKeys.findMany({ where: eq(apiKeys.projectId, projectId), orderBy: apiKeys.createdAt });
  }

  async revokeApiKey(projectId: string, id: string): Promise<void> {
    await this.db.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.projectId, projectId), eq(apiKeys.id, id)));
  }

  async touchApiKey(id: string, at: Date): Promise<void> {
    await this.db.update(apiKeys).set({ lastUsedAt: at }).where(eq(apiKeys.id, id));
  }

  async getFlag(projectId: string, key: string): Promise<boolean | null> {
    const row = await this.db.query.flags.findFirst({ where: and(eq(flags.projectId, projectId), eq(flags.key, key)) });
    return row ? row.value : null;
  }

  async setFlag(projectId: string, key: string, value: boolean, by: string | null): Promise<void> {
    await this.db
      .insert(flags)
      .values({ projectId, key, value, updatedBy: by })
      .onConflictDoUpdate({ target: [flags.projectId, flags.key], set: { value, updatedBy: by, updatedAt: new Date() } });
  }

  async listFlags(projectId: string): Promise<Record<string, boolean>> {
    const rows = await this.db.query.flags.findMany({ where: eq(flags.projectId, projectId) });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
}
