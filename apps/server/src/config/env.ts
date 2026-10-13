/**
 * Every setting the service reads, validated once at boot. The process refuses to start when a
 * required value is missing or malformed, with a sentence that says which one.
 */
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === '1' || v === 'true');

const list = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []));

export const envSchema = z.object({
  SEQ_DB_DSN: z.string().min(1, 'SEQ_DB_DSN is required: a Postgres connection string'),
  SEQ_QUEUE: z.enum(['postgres', 'redis', 'memory']).default('postgres'),
  SEQ_REDIS_DSN: z.string().optional(),
  SEQ_ENCRYPTION_KEYS: z.string().min(1, 'SEQ_ENCRYPTION_KEYS is required: "id:base64key[,id:base64key...]". Generate one with `oseq secrets new-key`.'),
  SEQ_ADMIN_TOKEN: z.string().optional(),
  SEQ_PUBLIC_URL: z.string().url().default('http://localhost:8080'),
  SEQ_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  SEQ_HOST: z.string().default('0.0.0.0'),
  SEQ_ROLES: z.enum(['api', 'worker', 'all']).default('all'),
  SEQ_RUN_MIGRATIONS: bool,
  SEQ_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(8),
  SEQ_DISABLED_CHANNELS: list,
  SEQ_PAUSED: bool,
  SEQ_DEV_MOCK_PROVIDERS: bool,
  SEQ_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SEQ_METRICS: bool,
  SEQ_DB_POOL: z.coerce.number().int().min(1).max(100).default(10),
  NODE_ENV: z.string().default('development'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(env)'}: ${i.message}`);
    throw new Error(`Configuration is invalid:\n${lines.join('\n')}`);
  }
  const env = parsed.data;
  if (env.SEQ_QUEUE === 'redis' && !env.SEQ_REDIS_DSN) throw new Error('SEQ_QUEUE=redis needs SEQ_REDIS_DSN.');
  if ((env.SEQ_ROLES === 'api' || env.SEQ_ROLES === 'all') && !env.SEQ_ADMIN_TOKEN) {
    throw new Error('SEQ_ADMIN_TOKEN is required for the api role: the operator token that creates projects.');
  }
  if (env.SEQ_DEV_MOCK_PROVIDERS && env.NODE_ENV === 'production') {
    throw new Error('SEQ_DEV_MOCK_PROVIDERS is refused when NODE_ENV=production.');
  }
  return env;
}
