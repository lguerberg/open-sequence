import type { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import { SiteFooter } from '@/components/site/footer';
import { SiteHeader } from '@/components/site/header';
import { links } from '@/lib/links';

// Next.js marks the 404 page noindex itself.
export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="wrap py-24 sm:py-32">
        <p className="t-label text-brand">404</p>
        <h1 className="t-display mt-6">This page is not here.</h1>
        <p className="t-sub mt-6 max-w-[34rem]">
          The link may be old. The docs moved to their own site.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <a href="/">Back to the home page</a>
          </Button>
          <Button asChild variant="light" size="lg" className="bg-surface">
            <a href={links.docs}>Open the docs</a>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
