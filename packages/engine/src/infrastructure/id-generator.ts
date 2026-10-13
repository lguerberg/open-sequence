import type { IdGenerator } from '../domain/shared/clock.js';
import { newId } from './ids.js';

export const ulidIds: IdGenerator = { next: (kind) => newId(kind) };
