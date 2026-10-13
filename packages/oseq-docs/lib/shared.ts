import { createGetUrl } from 'fumadocs-core/source';

export const siteName = 'OpenSequence';
export const siteUrl = 'https://docs.opensequence.dev';
export const projectUrl = 'https://opensequence.dev';
export const repoUrl = 'https://github.com/open-sequence/opensequence';
export const repoBranch = 'main';
/** Where the hand-written pages live in the repository, for the "edit on GitHub" link. */
export const contentDir = 'packages/oseq-docs/content/docs';

export const docsContentRoute = '/llms.mdx';

const getContentUrl = createGetUrl(docsContentRoute);

/** The Markdown rendering of a page, for the copy button and for agents. */
export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'content.md'];
  return { segments, url: getContentUrl(segments, page.locale) };
}
