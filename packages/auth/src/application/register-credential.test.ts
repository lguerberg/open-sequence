import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../index.js';
import { credentials } from '../infrastructure/persistence/schema.js';
import { closeTestDb, KEY_A, migrateTestDb, testDb, uniq } from '../test/db.js';

describe('registerCredential', () => {
  beforeAll(migrateTestDb);
  afterAll(closeTestDb);

  const auth = () => createAuth({ db: testDb(), encryptionKeys: KEY_A, publicUrl: 'http://localhost:8080' });

  it('refuses an API key whose probe fails, and stores nothing', async () => {
    const tenantId = uniq('prj');
    await expect(
      auth().registerCredential({
        tenantId,
        provider: 'allo',
        method: 'api_key',
        secrets: { api_key: 'allo_bad_key_7f3a' },
        probe: async () => ({ ok: false, missing: ['calls:read'], error: 'HTTP 401' }),
      })
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL', status: 422, details: { missing: ['calls:read'] } });
    expect(await auth().listCredentials(tenantId)).toEqual([]);
  });

  it('stores a probed API key encrypted and shows only the last four', async () => {
    const tenantId = uniq('prj');
    const probed: Record<string, string>[] = [];
    const view = await auth().registerCredential({
      tenantId,
      provider: 'allo',
      method: 'api_key',
      secrets: { api_key: 'allo_live_secret_7f3a', webhook_secret: 'whsec_123' },
      probe: async (s) => {
        probed.push(s);
        return { ok: true, scopes: ['calls:read', 'sms:send'] };
      },
    });
    expect(probed).toEqual([{ api_key: 'allo_live_secret_7f3a', webhook_secret: 'whsec_123' }]);
    expect(view).toMatchObject({ provider: 'allo', method: 'api_key', status: 'active', keyId: 'ka', last4: '7f3a', hasWebhookSecret: true, config: { scopes: ['calls:read', 'sms:send'] } });
    expect(JSON.stringify(view)).not.toContain('allo_live_secret');
    expect(JSON.stringify(view)).not.toContain('whsec');

    const status = await auth().credentialStatus(tenantId, 'allo');
    expect(JSON.stringify(status)).not.toContain('allo_live_secret');
    expect(status.last4).toBe('7f3a');

    const [row] = await testDb().select().from(credentials).where(eq(credentials.id, view.id));
    expect(row!.secretEnc).not.toContain('allo_live_secret');
    expect(row!.webhookSecretEnc).not.toContain('whsec');

    expect(await auth().credentialsFor(tenantId, 'allo')).toEqual({ api_key: 'allo_live_secret_7f3a', webhook_secret: 'whsec_123' });
  });

  it('upserts by (tenant, provider) and keeps the id', async () => {
    const tenantId = uniq('prj');
    const first = await auth().registerCredential({ tenantId, provider: 'google', method: 'oauth2', secrets: { client_id: '123-abc.apps', client_secret: 'GOCSPX-one' } });
    const second = await auth().registerCredential({ tenantId, provider: 'google', method: 'oauth2', secrets: { client_id: '456-def.apps', client_secret: 'GOCSPX-two' } });
    expect(second.id).toBe(first.id);
    expect(second.last4).toBe('apps');
    expect(await auth().credentialsFor(tenantId, 'google')).toEqual({ client_id: '456-def.apps', client_secret: 'GOCSPX-two' });
    expect(await auth().listCredentials(tenantId)).toHaveLength(1);
  });

  it('marks a credential invalid when a later probe fails and refuses to hand it out', async () => {
    const tenantId = uniq('prj');
    await auth().registerCredential({ tenantId, provider: 'attio', method: 'api_key', secrets: { api_key: 'attio_key_0001' } });
    const health = await auth().healthCheckCredential(tenantId, 'attio', async () => ({ ok: false, error: 'HTTP 401' }));
    expect(health).toMatchObject({ status: 'invalid', error: 'HTTP 401' });
    await expect(auth().credentialsFor(tenantId, 'attio')).rejects.toMatchObject({ code: 'CREDENTIAL_INVALID' });
    const again = await auth().healthCheckCredential(tenantId, 'attio', async () => ({ ok: true }));
    expect(again.status).toBe('active');
  });
});
