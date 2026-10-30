import { and, asc, eq, gt, gte, inArray, sql } from 'drizzle-orm';
import type { Contact, Suppression } from '../../../domain/entities.js';
import type { ContactRepository, ListOptions, Page } from '../../../domain/repositories.js';
import { decodeCursor, page, type DbOrTx } from '../db.js';
import { contacts, suppressions } from '../schema.js';

export class DrizzleContactRepository implements ContactRepository {
  constructor(private readonly db: DbOrTx) {}

  async upsertByExternalId(c: Omit<Contact, 'createdAt' | 'updatedAt'>, mergeAttrs: boolean): Promise<Contact> {
    const [row] = await this.db
      .insert(contacts)
      .values(c)
      .onConflictDoUpdate({
        target: [contacts.projectId, contacts.externalId],
        set: {
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          phone: c.phone,
          linkedinUrl: c.linkedinUrl,
          country: c.country,
          timezone: c.timezone,
          // consent is never touched by an upsert; it has its own admin endpoint
          attrs: mergeAttrs ? sql`${contacts.attrs} || ${JSON.stringify(c.attrs)}::jsonb` : c.attrs,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row!;
  }

  async byId(projectId: string, id: string): Promise<Contact | null> {
    return (await this.db.query.contacts.findFirst({ where: and(eq(contacts.projectId, projectId), eq(contacts.id, id)) })) ?? null;
  }

  async byIds(projectId: string, ids: string[]): Promise<Contact[]> {
    if (ids.length === 0) return [];
    return this.db.query.contacts.findMany({ where: and(eq(contacts.projectId, projectId), inArray(contacts.id, ids)) });
  }

  async byExternalId(projectId: string, externalId: string): Promise<Contact | null> {
    return (await this.db.query.contacts.findFirst({ where: and(eq(contacts.projectId, projectId), eq(contacts.externalId, externalId)) })) ?? null;
  }

  async byExternalIds(projectId: string, externalIds: string[]): Promise<Contact[]> {
    if (externalIds.length === 0) return [];
    return this.db.query.contacts.findMany({ where: and(eq(contacts.projectId, projectId), inArray(contacts.externalId, externalIds)) });
  }

  async byEmail(projectId: string, email: string): Promise<Contact | null> {
    return (await this.db.query.contacts.findFirst({ where: and(eq(contacts.projectId, projectId), sql`lower(${contacts.email}) = lower(${email})`) })) ?? null;
  }

  async byPhone(projectId: string, phone: string): Promise<Contact | null> {
    return (await this.db.query.contacts.findFirst({ where: and(eq(contacts.projectId, projectId), eq(contacts.phone, phone)) })) ?? null;
  }

  async list(projectId: string, opts: ListOptions & { email?: string; externalId?: string }): Promise<Page<Contact>> {
    const cursor = decodeCursor(opts.cursor);
    const rows = await this.db.query.contacts.findMany({
      where: and(
        eq(contacts.projectId, projectId),
        cursor ? gt(contacts.id, cursor) : undefined,
        opts.updatedSince ? gte(contacts.updatedAt, opts.updatedSince) : undefined,
        opts.email ? sql`lower(${contacts.email}) = lower(${opts.email})` : undefined,
        opts.externalId ? eq(contacts.externalId, opts.externalId) : undefined
      ),
      orderBy: asc(contacts.id),
      limit: opts.limit + 1,
    });
    return page(rows, opts.limit);
  }

  async patch(projectId: string, id: string, patch: Partial<Omit<Contact, 'id' | 'projectId' | 'externalId' | 'createdAt' | 'updatedAt'>>, mergeAttrs: boolean): Promise<Contact> {
    const { attrs, ...rest } = patch;
    const set: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (attrs !== undefined) set['attrs'] = mergeAttrs ? sql`${contacts.attrs} || ${JSON.stringify(attrs)}::jsonb` : attrs;
    const [row] = await this.db
      .update(contacts)
      .set(set)
      .where(and(eq(contacts.projectId, projectId), eq(contacts.id, id)))
      .returning();
    return row!;
  }

  async delete(projectId: string, id: string): Promise<void> {
    await this.db.delete(contacts).where(and(eq(contacts.projectId, projectId), eq(contacts.id, id)));
  }

  async suppressions(contactId: string): Promise<Suppression[]> {
    const rows = await this.db.query.suppressions.findMany({ where: eq(suppressions.contactId, contactId) });
    return rows.map((r) => ({ contactId: r.contactId, channel: r.channel as Suppression['channel'], reason: r.reason, createdAt: r.createdAt }));
  }

  async suppress(projectId: string, contactId: string, channel: Suppression['channel'], reason: string): Promise<void> {
    await this.db
      .insert(suppressions)
      .values({ projectId, contactId, channel, reason })
      .onConflictDoNothing({ target: [suppressions.contactId, suppressions.channel] });
  }
}
