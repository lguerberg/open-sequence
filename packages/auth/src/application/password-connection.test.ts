/**
 * Password connections (SMTP and IMAP): saved encrypted, read back only through
 * connectionSecrets, replaced in place, and disconnected without calling Google.
 */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../index.js';
import { connections } from '../infrastructure/persistence/schema.js';
import { closeTestDb, KEY_B, migrateTestDb, testDb, uniq } from '../test/db.js';
import { fakeGoogle } from '../test/fake-google.js';

describe('password connections', () => {
  beforeAll(migrateTestDb);
  afterAll(closeTestDb);

  // KEY_B: the rotation suite counts rows under KEY_A, so these rows stay out of its way.
  const google = fakeGoogle();
  const auth = () =>
    createAuth({ db: testDb(), encryptionKeys: KEY_B, publicUrl: 'http://localhost:8080', google });
  const config = {
    smtp: { host: 'smtp.example.com', port: 465, secure: true, user: 'rep@example.com' },
    imap: { host: 'imap.example.com', port: 993, secure: true, user: 'rep@example.com' },
  };

  it('stores the passwords encrypted, never shows them, and hands them to adapters', async () => {
    const a = auth();
    const tenantId = uniq('prj');
    const ownerId = uniq('snd');
    const view = await a.savePasswordConnection({
      tenantId,
      ownerId,
      provider: 'smtp',
      account: 'rep@example.com',
      config,
      secrets: { smtp_password: 'smtp-pass-1', imap_password: 'imap-pass-1' },
    });
    expect(view).toMatchObject({
      tenantId,
      ownerId,
      provider: 'smtp',
      account: 'rep@example.com',
      status: 'active',
      config,
    });
    expect(JSON.stringify(view)).not.toMatch(/pass-1/);
    expect(JSON.stringify(await a.listConnections(tenantId, ownerId))).not.toMatch(/pass-1/);

    const row = (await testDb().select().from(connections).where(eq(connections.id, view.id)))[0]!;
    expect(row.secretEnc).not.toMatch(/pass-1/);
    expect(row.keyId).toBe('kb');

    expect(await a.connectionSecrets(view.id)).toEqual({
      account: 'rep@example.com',
      config,
      secrets: { smtp_password: 'smtp-pass-1', imap_password: 'imap-pass-1' },
    });
  });

  it('saving again replaces the settings of the same connection', async () => {
    const a = auth();
    const tenantId = uniq('prj');
    const ownerId = uniq('snd');
    const first = await a.savePasswordConnection({
      tenantId,
      ownerId,
      provider: 'smtp',
      account: 'rep@example.com',
      config,
      secrets: { smtp_password: 'a', imap_password: 'a' },
    });
    const second = await a.savePasswordConnection({
      tenantId,
      ownerId,
      provider: 'smtp',
      account: 'max@example.com',
      config: { ...config, smtp: { ...config.smtp, port: 587, secure: false } },
      secrets: { smtp_password: 'b', imap_password: 'b' },
    });
    expect(second.id).toBe(first.id);
    expect(second.account).toBe('max@example.com');
    expect((await a.connectionSecrets(first.id)).secrets).toEqual({
      smtp_password: 'b',
      imap_password: 'b',
    });
  });

  it('revoke deletes the passwords without calling Google; the adapter then gets credentials_needed', async () => {
    const a = auth();
    const view = await a.savePasswordConnection({
      tenantId: uniq('prj'),
      ownerId: uniq('snd'),
      provider: 'smtp',
      account: 'rep@example.com',
      config,
      secrets: { smtp_password: 'x', imap_password: 'y' },
    });
    const revokedBefore = google.calls.revoke.length;
    const revoked = await a.revoke(view.id);
    expect(revoked.status).toBe('disconnected');
    expect(google.calls.revoke.length).toBe(revokedBefore);
    const row = (await testDb().select().from(connections).where(eq(connections.id, view.id)))[0]!;
    expect(row.secretEnc).toBeNull();
    await expect(a.connectionSecrets(view.id)).rejects.toMatchObject({
      code: 'CREDENTIALS_NEEDED',
      message: expect.stringMatching(/^credentials_needed/),
    });
    expect(await a.health(view.id)).toMatchObject({ ok: false, status: 'disconnected' });
  });

  it('refuses a Google connection either way', async () => {
    const a = auth();
    await expect(
      a.savePasswordConnection({
        tenantId: uniq('prj'),
        ownerId: uniq('snd'),
        provider: 'google',
        account: 'x@example.com',
        config: {},
        secrets: { p: 'x' },
      })
    ).rejects.toMatchObject({ code: 'WRONG_FLOW' });
  });
});
