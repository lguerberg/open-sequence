import { DocsLayout } from 'fumadocs-ui/layouts/notebook';
import type { ReactNode } from 'react';
import { baseOptions, siteLink } from '@/lib/layout.shared';
import { source } from '@/lib/source';

/**
 * A top bar (logo, the four tabs, search, opensequence.dev, GitHub, theme) over a sidebar of
 * sections. The four root folders (docs, api, sdks, reference) are the tabs: their meta.json sets
 * `root: true`.
 */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout tree={source.getPageTree()} tabMode="navbar" nav={{ ...baseOptions().nav, mode: 'top' }} githubUrl={baseOptions().githubUrl} links={[siteLink]}>
      {children}
    </DocsLayout>
  );
}
