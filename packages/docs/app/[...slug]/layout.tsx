import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { baseOptions } from '@/lib/layout.shared';
import { source } from '@/lib/source';

/** The four root folders (docs, api, sdks, reference) are the tabs; their meta.json sets `root: true`. */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout tree={source.getPageTree()} tabMode="top" {...baseOptions()}>
      {children}
    </DocsLayout>
  );
}
