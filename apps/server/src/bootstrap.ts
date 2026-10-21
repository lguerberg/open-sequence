/**
 * The composition root: the only place that knows every concrete class. Builds the database, the
 * queue, the auth module, the providers (real or mock) and the engine's Deps, then hands them to
 * the HTTP app and the workers. Nothing else wires anything.
 */
import { createHmac } from 'node:crypto';
import { createAuth, AesGcmCipher, runAuthMigrations } from '@opensequence/auth';
import { ensureBuiltins, type ProviderSet } from '@opensequence/core';
import { connect, DEFAULT_CONFIG, DrizzleUnitOfWork, fetchWebhookTransport, runMigrations, systemClock, ulidIds, type Deps } from '@opensequence/engine';
import { AlloDialerProvider, AlloSmsProvider, AttioCrmProvider, createMockProviders, createSmtpProviders, probeSmtpImap, type MockProviders } from '@opensequence/providers';
import { createQueue, queueJoinsTransaction } from '@opensequence/queue';
import type pino from 'pino';
import type { Env } from './config/env.js';
import type { AppContext, AuthModule } from './http/context.js';
import { healthState } from './http/routes/health.js';
import { signOptOutToken, verifyOptOutToken } from './http/routes/optout.js';
import { engineLogger } from './infrastructure/logger.js';

export interface Runtime extends AppContext {
  db: ReturnType<typeof connect>['db'];
  optOutSecret: string;
  close(): Promise<void>;
}

export async function bootstrap(env: Env, log: pino.Logger): Promise<Runtime> {
  ensureBuiltins();
  const handle = connect(env.SEQ_DB_DSN, { max: env.SEQ_DB_POOL });
  const db = handle.db;

  if (env.SEQ_RUN_MIGRATIONS) {
    const applied = await runMigrations(db, { log: { info: (m) => log.info(m) } });
    await runAuthMigrations(db);
    log.info({ applied }, 'migrations applied');
  }
  healthState.migrated = true;

  const queue = createQueue(env.SEQ_QUEUE, { db, redis: env.SEQ_REDIS_DSN });
  const uow = new DrizzleUnitOfWork(db, ulidIds, systemClock, queue, queueJoinsTransaction(env.SEQ_QUEUE));

  const auth: AuthModule = createAuth({ db, encryptionKeys: env.SEQ_ENCRYPTION_KEYS });
  const cipher = new AesGcmCipher(env.SEQ_ENCRYPTION_KEYS);
  // The opt-out link signer derives its key from the current encryption key, so one secret rules them all.
  const optOutSecret = createHmac('sha256', env.SEQ_ENCRYPTION_KEYS).update('opt-out-links').digest('hex');

  let providers: ProviderSet;
  let mock: MockProviders | undefined;
  let probeMailbox: AppContext['probeMailbox'] = (creds) => probeSmtpImap(creds);
  if (env.SEQ_DEV_MOCK_PROVIDERS) {
    const m = createMockProviders();
    providers = m;
    mock = m.mock;
    probeMailbox = async () => ({ ok: true });
    log.warn('mock providers are on: nothing is sent to Allo, Attio or any mail server');
  } else {
    const smtp = createSmtpProviders(auth, { warn: (message, meta) => log.warn(meta, message) });
    providers = {
      email: smtp.email,
      sms: new AlloSmsProvider(auth),
      dialer: new AlloDialerProvider(auth),
      crm: new AttioCrmProvider(auth),
    };
  }

  const deps: Deps = {
    uow,
    queue,
    providers,
    ids: ulidIds,
    clock: systemClock,
    log: engineLogger(log),
    secrets: { encrypt: async (plain) => cipher.encrypt(plain), decrypt: async (c, k) => cipher.decrypt(c, k) },
    webhookTransport: fetchWebhookTransport,
    optOutToken: (t) => signOptOutToken(optOutSecret, t),
    optOutVerify: (token, now) => verifyOptOutToken(optOutSecret, token, now),
    config: {
      ...DEFAULT_CONFIG,
      paused: env.SEQ_PAUSED,
      disabledChannels: new Set(env.SEQ_DISABLED_CHANNELS),
      publicUrl: env.SEQ_PUBLIC_URL,
    },
  };

  return {
    env,
    deps,
    auth,
    mock,
    probeMailbox,
    db,
    optOutSecret,
    close: async () => {
      await handle.close();
    },
  };
}
