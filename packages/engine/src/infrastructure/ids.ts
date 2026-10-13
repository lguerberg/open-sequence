/**
 * Prefixed ULIDs: the primary key is already the public id, sortable by time, no mapping layer.
 */
import { ulid } from 'ulid';

export const ID_PREFIXES = {
  project: 'prj',
  apiKey: 'key',
  sender: 'snd',
  channel: 'chn',
  contact: 'ctc',
  sequence: 'seq',
  version: 'ver',
  enrollment: 'enr',
  run: 'run',
  message: 'msg',
  signal: 'sig',
  task: 'tsk',
  webhookEndpoint: 'wep',
  delivery: 'wdl',
  event: 'evt',
} as const;

export type IdKind = keyof typeof ID_PREFIXES;

export function newId(kind: IdKind): string {
  return `${ID_PREFIXES[kind]}_${ulid()}`;
}

/** A value with a known prefix is a service id; anything else is a client's external id (or `ext:` forces it). */
export function isServiceId(value: string): boolean {
  const m = /^([a-z]{3})_[0-9A-HJKMNP-TV-Z]{26}$/.exec(value);
  return m !== null && (Object.values(ID_PREFIXES) as string[]).includes(m[1]!);
}

export function externalIdOf(value: string): string | null {
  if (value.startsWith('ext:')) return value.slice(4);
  return isServiceId(value) ? null : value;
}
