import { HomeLayout } from 'fumadocs-ui/layouts/home';
import type { Metadata } from 'next';
import Link from 'next/link';
import { baseOptions, sectionLinks } from '@/lib/layout.shared';

export const metadata: Metadata = {
  title: 'Page not found',
  description: 'This page does not exist. Start from the quickstart, the docs or the API reference.',
};

const links = [
  { href: '/docs/get-started/quickstart', text: 'Quickstart' },
  { href: '/docs', text: 'Docs' },
  { href: '/api/conventions', text: 'API reference' },
  { href: '/sdks/typescript', text: 'SDKs and CLI' },
  { href: '/reference/glossary', text: 'Reference' },
];

/** The 404 page (`404.html` in the static export). */
export default function NotFound() {
  return (
    <HomeLayout {...baseOptions()} links={sectionLinks}>
      <main className="container mx-auto flex flex-1 flex-col justify-center gap-6 px-6 py-16 max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-fd-muted-foreground">
          This page does not exist, or it moved. Search with <kbd className="rounded border px-1">Ctrl K</kbd>, or start from one of these:
        </p>
        <ul className="flex flex-wrap gap-3">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="rounded-lg border border-fd-border bg-fd-card px-3 py-1.5 text-sm transition-colors hover:bg-fd-accent">
                {l.text}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </HomeLayout>
  );
}
