/**
 * What every use case receives. The composition root (createAuth) builds one of these; tests build
 * one with fakes.
 */
import type { Cipher, Clock, IdGenerator } from '../domain/ports.js';
import type { ConnectionRepository, CredentialRepository } from '../domain/repositories.js';

export interface AuthDeps {
  credentials: CredentialRepository;
  connections: ConnectionRepository;
  cipher: Cipher;
  clock: Clock;
  ids: IdGenerator;
}
