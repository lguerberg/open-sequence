#!/usr/bin/env node
/**
 * oseq: the operator CLI. Every command is a thin wrapper over the same use cases the API exposes,
 * so the docs for one are the docs for the other.
 */
import { randomBytes } from 'node:crypto';
import { Command } from 'commander';
import { runAuthMigrations } from '@opensequence/auth';
import { connect, createApiKey, createProject, runMigrations } from '@opensequence/engine';
import { loadEnv } from './config/env.js';
import { bootstrap } from './bootstrap.js';
import { createLogger } from './infrastructure/logger.js';

const program = new Command().name('oseq').description('OpenSequence operator CLI').version('0.1.0');

const envFor = (needsAdmin = false) => {
  const env = loadEnv({ ...process.env, SEQ_ROLES: 'worker', SEQ_ADMIN_TOKEN: process.env['SEQ_ADMIN_TOKEN'] ?? (needsAdmin ? undefined : 'cli') });
  return env;
};

program
  .command('secrets')
  .description('Encryption keys')
  .command('new-key')
  .description('Print a new SEQ_ENCRYPTION_KEYS entry (id:base64 of 32 random bytes)')
  .action(() => {
    const id = `k${Date.now().toString(36)}`;
    console.log(`${id}:${randomBytes(32).toString('base64')}`);
  });

program
  .command('migrate')
  .description('Apply the seq and auth migrations')
  .action(async () => {
    const env = envFor();
    const { db, close } = connect(env.SEQ_DB_DSN, { max: 2 });
    const applied = await runMigrations(db, { log: { info: (m) => console.log(m) } });
    await runAuthMigrations(db);
    console.log(applied.length ? `applied ${applied.length} migration(s)` : 'already up to date');
    await close();
  });

const projects = program.command('projects').description('Tenants');
projects
  .command('create <slug>')
  .option('-n, --name <name>', 'display name')
  .description('Create a project and print its first admin API key (shown once)')
  .action(async (slug: string, opts: { name?: string }) => {
    const env = envFor();
    const rt = await bootstrap({ ...env, SEQ_RUN_MIGRATIONS: false }, createLogger('warn', false));
    const { project, apiKey } = await createProject(rt.deps, { slug, name: opts.name ?? slug });
    console.log(JSON.stringify({ project: project.id, slug: project.slug, api_key: apiKey }, null, 2));
    await rt.close();
  });
projects
  .command('list')
  .action(async () => {
    const env = envFor();
    const rt = await bootstrap({ ...env, SEQ_RUN_MIGRATIONS: false }, createLogger('warn', false));
    const all = await rt.deps.uow.repos.projects.list();
    for (const p of all) console.log(`${p.id}\t${p.slug}\t${p.name}`);
    await rt.close();
  });

program
  .command('api-keys')
  .description('Project API keys')
  .command('create <project>')
  .requiredOption('-s, --scopes <scopes>', 'comma-separated: read,enroll,admin')
  .option('-n, --name <name>', 'label', 'cli')
  .action(async (project: string, opts: { scopes: string; name: string }) => {
    const env = envFor();
    const rt = await bootstrap({ ...env, SEQ_RUN_MIGRATIONS: false }, createLogger('warn', false));
    const { key, secret } = await createApiKey(rt.deps, { projectId: project, name: opts.name, scopes: opts.scopes.split(',') });
    console.log(JSON.stringify({ key: key.id, prefix: key.prefix, scopes: key.scopes, api_key: secret }, null, 2));
    await rt.close();
  });

program
  .command('health')
  .description('Queue depths and job state')
  .action(async () => {
    const env = envFor();
    const rt = await bootstrap({ ...env, SEQ_RUN_MIGRATIONS: false }, createLogger('warn', false));
    const [queues, jobs] = await Promise.all([rt.deps.queue.stats(), rt.deps.uow.repos.scheduler.lastRuns()]);
    console.log(JSON.stringify({ queues, jobs }, null, 2));
    await rt.close();
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
