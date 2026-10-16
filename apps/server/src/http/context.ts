import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { createAuth } from '@opensequence/auth';
import type { Deps } from '@opensequence/engine';
import type { MockProviders, SmtpCredentials, SmtpProbeResult } from '@opensequence/providers';
import type { Env } from '../config/env.js';

export type AuthModule = ReturnType<typeof createAuth>;

/** Everything a route plugin needs, built once by the composition root. */
export interface AppContext {
  env: Env;
  deps: Deps;
  auth: AuthModule;
  /** Present only with SEQ_DEV_MOCK_PROVIDERS=1: the hooks route lets tests simulate provider events. */
  mock?: MockProviders;
  /** Logs in to a mailbox's SMTP and IMAP servers before its settings are stored; always ok with mock providers. */
  probeMailbox: (creds: SmtpCredentials) => Promise<SmtpProbeResult>;
}

export type App = FastifyInstance & { withTypeProvider(): ReturnType<FastifyInstance['withTypeProvider']> };
export type Typed = ReturnType<FastifyInstance['withTypeProvider']>;
export type TypedApp = ReturnType<FastifyInstance['withTypeProvider']> extends infer T ? T : never;
export type ZodApp = ReturnType<FastifyInstance['withTypeProvider']>;
export type { ZodTypeProvider };

export const listQuery = {
  limit: { min: 1, max: 200, default: 50 },
};
