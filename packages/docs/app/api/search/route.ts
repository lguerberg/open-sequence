import { createFromSource } from 'fumadocs-core/search/server';
import { source } from '@/lib/source';

export const revalidate = false;

/** The search index, exported once at build and queried in the browser (static export). */
export const { staticGET: GET } = createFromSource(source, {
  language: 'english',
});
