/**
 * What every use case receives. The composition root (apps/server) builds one of these; tests build
 * one with the mock provider and a frozen clock. Use cases never import infrastructure.
 */
import type { ProviderSet, Queue } from '@opensequence/core';
import type { UnitOfWork } from '../domain/repositories.js';
import type { Clock, IdGenerator } from '../domain/shared/clock.js';

export interface Logger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
  debug(obj: Record<string, unknown>, msg: string): void;
}

/** Secrets never pass through use cases in the clear; this port stores and resolves them. */
export interface SecretsPort {
  /** Encrypt for storage; returns the ciphertext and the key id that produced it. */
  encrypt(plain: string): Promise<{ ciphertext: string; keyId: string }>;
  decrypt(ciphertext: string, keyId: string): Promise<string>;
}

/** One HTTPS POST to a client's endpoint; the signing and the retry policy live in the use case. */
export interface WebhookTransport {
  post(url: string, body: string, headers: Record<string, string>, timeoutMs: number): Promise<{ status: number; error?: string }>;
}

export interface EngineConfig {
  /** Platform-wide switches from the environment. */
  paused: boolean;
  disabledChannels: Set<string>;
  /** How many due enrollments one planner tick claims, per sender and in total. */
  planPerSender: number;
  planMaxTotal: number;
  /** Executor message retries before a run is failed. */
  maxReads: number;
  /** The public base URL, for opt-out links. */
  publicUrl: string;
}

/** Signs the opt-out link token for one run; the server verifies it at GET /u/{token}. */
export type OptOutTokenSigner = (t: { projectId: string; contactId: string; runId: string; exp: number }) => string;

export interface Deps {
  uow: UnitOfWork;
  queue: Queue;
  providers: ProviderSet;
  ids: IdGenerator;
  clock: Clock;
  log: Logger;
  secrets: SecretsPort;
  webhookTransport: WebhookTransport;
  optOutToken: OptOutTokenSigner;
  config: EngineConfig;
}

export const DEFAULT_CONFIG: EngineConfig = {
  paused: false,
  disabledChannels: new Set(),
  planPerSender: 50,
  planMaxTotal: 500,
  maxReads: 5,
  publicUrl: 'http://localhost:8080',
};
