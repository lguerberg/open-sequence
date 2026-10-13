import type { BaseLayoutProps, LinkItemType } from 'fumadocs-ui/layouts/shared';
import { Logo } from '@/components/logo';
import { repoUrl } from './shared';

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

/** The four sections, for the landing page's navbar; inside the docs the same four are the tabs. */
export const sectionLinks: LinkItemType[] = [
  { text: 'Docs', url: '/docs', active: 'nested-url' },
  { text: 'API reference', url: '/api/conventions', active: 'nested-url' },
  { text: 'SDKs and CLI', url: '/sdks/typescript', active: 'nested-url' },
  { text: 'Reference', url: '/reference/glossary', active: 'nested-url' },
];
