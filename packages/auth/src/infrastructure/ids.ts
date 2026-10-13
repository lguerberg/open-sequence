/**
 * Prefixed ULIDs: the primary key is already the public id, sortable by time, no mapping layer.
 */
import { ulid } from 'ulid';

export const ID_PREFIXES = {
  credential: 'cred',
  connection: 'con',
} as const;

export type IdKind = keyof typeof ID_PREFIXES;

export function newId(kind: IdKind): string {
  return `${ID_PREFIXES[kind]}_${ulid()}`;
}
