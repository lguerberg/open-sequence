import type { BaseLayoutProps, LinkItemType } from 'fumadocs-ui/layouts/shared';
import { Logo } from '@/components/logo';
import { projectUrl, repoUrl } from './shared';

/** Shared by the home layout and the docs layout: logo, GitHub link, theme switch. */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <Logo />,
      url: '/',
    },
    githubUrl: repoUrl,
  };
}

/** The product site, shown in the top bar of every page. */
export const siteLink: LinkItemType = { text: 'opensequence.dev', url: projectUrl, external: true };

/** The top bar of the home and 404 pages; inside the docs the first three are the tabs. */
export const sectionLinks: LinkItemType[] = [
  { text: 'Docs', url: '/docs', active: 'nested-url' },
  { text: 'API', url: '/api/conventions', active: 'nested-url' },
  { text: 'SDKs', url: '/sdks/typescript', active: 'nested-url' },
  { text: 'Reference', url: '/reference/glossary', active: 'nested-url' },
  siteLink,
];
