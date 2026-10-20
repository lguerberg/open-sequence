import type { ProviderSet } from '@opensequence/core';
import type { ConnectionSecretSource, CredentialSource } from './credentials.js';

/**
 * Adapters register by name (docs/ARCHITECTURE.md section 20.1). The composition root asks the
 * registry for a factory and never lists providers itself, so a module can add one.
 */
export interface ProviderFactoryContext {
  /** Project-level secrets (API-key providers). */
  credentials: CredentialSource;
  /** Per-connection password settings (SMTP and IMAP); the auth module provides it. */
  connectionSecrets?: ConnectionSecretSource;
  /** Adapter options such as a base URL override; shape is per provider. */
  options?: Record<string, unknown>;
}

export type ProviderFactory = (ctx: ProviderFactoryContext) => Partial<ProviderSet>;

const factories = new Map<string, ProviderFactory>();

export function registerProvider(name: string, factory: ProviderFactory): void {
  factories.set(name, factory);
}

export function providerFactory(name: string): ProviderFactory {
  const factory = factories.get(name);
  if (!factory) throw new Error(`PROVIDER_UNKNOWN: no provider is registered under "${name}" (known: ${[...factories.keys()].join(', ') || 'none'})`);
  return factory;
}

export function registeredProviders(): string[] {
  return [...factories.keys()];
}
