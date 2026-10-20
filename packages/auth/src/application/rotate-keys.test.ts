import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../index.js';
import { connections, credentials } from '../infrastructure/persistence/schema.js';
import { closeTestDb, KEY_A, KEY_B, migrateTestDb, testDb, uniq } from '../test/db.js';

describe('rotateKeys', () => {
  beforeAll(migrateTestDb);
  afterAll(closeTestDb);

  it('re-encrypts every row under the current key, after which the old key can go', async () => {
    const tenantId = uniq('prj');
    const ownerId = uniq('snd');

    // Day 1: only key A exists.
    const dayOne = createAuth({ db: testDb(), encryptionKeys: KEY_A });
    await dayOne.registerCredential({ tenantId, provider: 'attio', method: 'api_key', secrets: { api_key: 'attio_key' } });
    await dayOne.registerCredential({ tenantId, provider: 'allo', method: 'api_key', secrets: { api_key: 'allo_key', webhook_secret: 'whsec' } });
    const { id: connectionId } = await dayOne.savePasswordConnection({ tenantId, ownerId, provider: 'smtp', account: 'rep@example.com', config: {}, secrets: { smtp_password: 'pw' } });
    expect((await testDb().select().from(connections).where(eq(connections.id, connectionId)))[0]!.keyId).toBe('ka');

    // Day 2: key B is added in front; rotation moves every row to it.
    const dayTwo = createAuth({ db: testDb(), encryptionKeys: `${KEY_B},${KEY_A}` });
    const result = await dayTwo.rotateKeys();
    expect(result.keyId).toBe('kb');
    expect(result.credentials).toBeGreaterThanOrEqual(2);
    expect(result.connections).toBeGreaterThanOrEqual(1);
    const creds = await testDb().select().from(credentials).where(eq(credentials.tenantId, tenantId));
    expect(creds.map((c) => c.keyId)).toEqual(['kb', 'kb']);
    expect((await testDb().select().from(connections).where(eq(connections.id, connectionId)))[0]!.keyId).toBe('kb');

    // Running it again touches nothing of ours.
    const again = await dayTwo.rotateKeys();
    expect(again).toEqual({ keyId: 'kb', credentials: 0, connections: 0 });

    // Day 3: key A is removed; every secret still reads.
    const dayThree = createAuth({ db: testDb(), encryptionKeys: KEY_B });
    expect(await dayThree.credentialsFor(tenantId, 'attio')).toEqual({ api_key: 'attio_key' });
    expect(await dayThree.credentialsFor(tenantId, 'allo')).toEqual({ api_key: 'allo_key', webhook_secret: 'whsec' });
    expect((await dayThree.connectionSecrets(connectionId)).secrets).toEqual({ smtp_password: 'pw' });
    expect((await dayThree.credentialStatus(tenantId, 'allo')).keyId).toBe('kb');
  });
});
