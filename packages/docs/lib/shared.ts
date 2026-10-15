import { createGetUrl } from 'fumadocs-core/source';

export const siteName = 'OpenSequence';
export const siteUrl = 'https://docs.opensequence.dev';
export const siteTitle = 'OpenSequence docs';
export const siteDescription =
  'Docs for OpenSequence, the open source, self-hosted service that runs multi-step sales sequences for any CRM: quickstart, guides, API reference and SDKs.';
export const projectUrl = 'https://www.opensequence.dev';
export const repoUrl = 'https://github.com/lguerberg/open-sequence';
export const repoBranch = 'main';
/** Where the hand-written pages live in the repository, for the "edit on GitHub" link. */
export const contentDir = 'packages/docs/content/docs';

/** The brand colours, shared by the icons and the Open Graph cards (the same as opensequence.dev). */
export const brand = { navy: '#0f1b2a', celeste: '#74acdf', white: '#ffffff', muted: '#5b6b7f' } as const;
/** The mark's trace: a navy pulse on a celeste tile, viewBox 0 0 24 24. */
export const markPath = 'M5.5 12h3.4l2.1-4.8 2.3 9.6 2.1-4.8h3.1';

/** A path on this site as an absolute URL, for canonical links, Open Graph and JSON-LD. */
export function absoluteUrl(path: string): string {
  return path === '/' ? siteUrl : `${siteUrl}${path}`;
}

/** The Open Graph card of a page: `/og/<slugs>/image.png`, and `/og/image.png` for the home page. */
export function getPageImage(slugs: string[]) {
  const segments = [...slugs, 'image.png'];
  return { segments, url: `/og/${segments.join('/')}` };
}

export const docsContentRoute = '/llms.mdx';

const getContentUrl = createGetUrl(docsContentRoute);

/** The Markdown rendering of a page, for the copy button and for agents. */
export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'content.md'];
  return { segments, url: getContentUrl(segments, page.locale) };
}
