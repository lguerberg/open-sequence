import { and, asc, count, eq, gt, gte, inArray } from 'drizzle-orm';
import type { Sequence, Version } from '../../../domain/entities.js';
import type { ListOptions, Page, SequenceRepository } from '../../../domain/repositories.js';
import { decodeCursor, page, type DbOrTx } from '../db.js';
import { enrollments, sequences, versions } from '../schema.js';

export class DrizzleSequenceRepository implements SequenceRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(s: Omit<Sequence, 'createdAt' | 'updatedAt'>): Promise<Sequence> {
    const [row] = await this.db.insert(sequences).values(s).returning();
    return row!;
  }

  async byId(projectId: string, id: string): Promise<Sequence | null> {
    return (await this.db.query.sequences.findFirst({ where: and(eq(sequences.projectId, projectId), eq(sequences.id, id)) })) ?? null;
  }

  async byExternalId(projectId: string, externalId: string): Promise<Sequence | null> {
    return (await this.db.query.sequences.findFirst({ where: and(eq(sequences.projectId, projectId), eq(sequences.externalId, externalId)) })) ?? null;
  }

  async list(projectId: string, opts: ListOptions): Promise<Page<Sequence>> {
    const cursor = decodeCursor(opts.cursor);
    const rows = await this.db.query.sequences.findMany({
      where: and(eq(sequences.projectId, projectId), cursor ? gt(sequences.id, cursor) : undefined, opts.updatedSince ? gte(sequences.updatedAt, opts.updatedSince) : undefined),
      orderBy: asc(sequences.id),
      limit: opts.limit + 1,
    });
    return page(rows, opts.limit);
  }

  async update(projectId: string, id: string, patch: Partial<Pick<Sequence, 'name' | 'description' | 'labels' | 'status' | 'defaultVersionId'>>): Promise<Sequence> {
    const [row] = await this.db
      .update(sequences)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(sequences.projectId, projectId), eq(sequences.id, id)))
      .returning();
    return row!;
  }

  async createVersion(v: Omit<Version, 'createdAt' | 'updatedAt'>): Promise<Version> {
    const [row] = await this.db.insert(versions).values(v).returning();
    return row!;
  }

  async version(projectId: string, id: string): Promise<Version | null> {
    return (await this.db.query.versions.findFirst({ where: and(eq(versions.projectId, projectId), eq(versions.id, id)) })) ?? null;
  }

  async versions(sequenceId: string): Promise<Version[]> {
    return this.db.query.versions.findMany({ where: eq(versions.sequenceId, sequenceId), orderBy: asc(versions.createdAt) });
  }

  async saveDraft(id: string, definition: Record<string, unknown>, expectedLock: number): Promise<Version | 'stale' | 'not_editable'> {
    const current = await this.db.query.versions.findFirst({ where: eq(versions.id, id) });
    if (!current) return 'not_editable';
    if (current.status !== 'draft') return 'not_editable';
    const [row] = await this.db
      .update(versions)
      .set({ definition, lockVersion: expectedLock + 1, updatedAt: new Date() })
      .where(and(eq(versions.id, id), eq(versions.lockVersion, expectedLock), eq(versions.status, 'draft')))
      .returning();
    return row ?? 'stale';
  }

  async publish(id: string, by: string | null, at: Date): Promise<Version> {
    const [row] = await this.db
      .update(versions)
      .set({ status: 'published', publishedBy: by, publishedAt: at, updatedAt: at })
      .where(eq(versions.id, id))
      .returning();
    return row!;
  }

  async archiveVersion(id: string, at: Date): Promise<Version> {
    const [row] = await this.db.update(versions).set({ status: 'archived', archivedAt: at, updatedAt: at }).where(eq(versions.id, id)).returning();
    return row!;
  }

  async deleteDraft(id: string): Promise<boolean> {
    const rows = await this.db.delete(versions).where(and(eq(versions.id, id), eq(versions.status, 'draft'))).returning({ id: versions.id });
    return rows.length > 0;
  }

  async countActiveEnrollments(sequenceId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(enrollments)
      .where(and(eq(enrollments.sequenceId, sequenceId), inArray(enrollments.status, ['active', 'paused', 'waiting_limit'])));
    return row?.n ?? 0;
  }
}
