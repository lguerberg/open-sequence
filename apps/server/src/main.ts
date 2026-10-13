/**
 * Entry point. One image, roles by SEQ_ROLES: `api` serves HTTP, `worker` runs the scheduler and
 * the queue consumers, `all` does both. SIGTERM stops accepting, finishes in-flight work (up to
 * 30 s) and exits; anything left reappears when its visibility timeout expires.
 */
import { loadEnv } from './config/env.js';
import { bootstrap } from './bootstrap.js';
import { buildApp } from './http/app.js';
import { createLogger } from './infrastructure/logger.js';
import { consumerSpecs, startConsumer, type ConsumerHandle } from './workers/consumers.js';
import { startScheduler, type SchedulerHandle } from './workers/scheduler.js';

async function main() {
  const env = loadEnv();
  const log = createLogger(env.SEQ_LOG_LEVEL, env.NODE_ENV !== 'production');
  const rt = await bootstrap(env, log);

  const app = await buildApp(rt, log);
  const serveApi = env.SEQ_ROLES === 'api' || env.SEQ_ROLES === 'all';
  const runWorker = env.SEQ_ROLES === 'worker' || env.SEQ_ROLES === 'all';

  // The worker role still listens, for /healthz and /readyz only; the API routes answer too but are not exposed publicly.
  await app.listen({ port: env.SEQ_PORT, host: env.SEQ_HOST });
  log.info({ port: env.SEQ_PORT, roles: env.SEQ_ROLES, queue: env.SEQ_QUEUE, mock: env.SEQ_DEV_MOCK_PROVIDERS }, serveApi ? 'OpenSequence api listening' : 'OpenSequence worker health endpoint listening');

  let scheduler: SchedulerHandle | undefined;
  const consumers: ConsumerHandle[] = [];
  if (runWorker) {
    scheduler = startScheduler(rt.deps);
    for (const spec of consumerSpecs()) consumers.push(startConsumer(rt.deps, spec, env.SEQ_CONCURRENCY));
    log.info({ queues: consumerSpecs().map((s) => s.queue) }, 'workers started');
  }

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, 'shutting down');
    const timer = setTimeout(() => {
      log.error('shutdown timed out; exiting');
      process.exit(1);
    }, 35_000);
    try {
      await app.close();
      await scheduler?.stop();
      await Promise.all(consumers.map((c) => c.stop()));
      await rt.close();
      clearTimeout(timer);
      process.exit(0);
    } catch (err) {
      log.error({ err }, 'shutdown failed');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
