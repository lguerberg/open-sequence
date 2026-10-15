import type { Metadata } from 'next';
import { BlogJsonLd } from '@/components/blog/json-ld';
import { PostCard } from '@/components/blog/parts';
import { Label } from '@/components/ds/marks';
import { Cta } from '@/components/site/cta';
import { SiteFooter } from '@/components/site/footer';
import { SiteHeader } from '@/components/site/header';
import { BLOG_DESCRIPTION, getAllPosts } from '@/lib/blog';
import { SITE_NAME } from '@/lib/site';

const title = 'Blog: sales sequencing you own';
const shareAlt = 'The OpenSequence blog: notes on owning your sales sequencing.';

export const metadata: Metadata = {
  title,
  description: BLOG_DESCRIPTION,
  alternates: {
    canonical: '/blog',
    types: { 'application/rss+xml': [{ url: '/blog/rss.xml', title: `${SITE_NAME} blog` }] },
  },
  openGraph: {
    title: `${SITE_NAME} blog`,
    description: BLOG_DESCRIPTION,
    url: '/blog',
    siteName: SITE_NAME,
    type: 'website',
    locale: 'en_US',
    images: [{ url: '/blog/og.png', width: 1200, height: 630, type: 'image/png', alt: shareAlt }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} blog`,
    description: BLOG_DESCRIPTION,
    images: [{ url: '/blog/og.png', alt: shareAlt }],
  },
};

export default async function BlogIndex() {
  const posts = await getAllPosts();
  return (
    <>
      <BlogJsonLd posts={posts} />
      <SiteHeader />
      <main>
        <section aria-labelledby="blog-title" className="wrap pt-8 pb-14 sm:pt-14 sm:pb-20">
          <Label>Blog</Label>
          <h1 id="blog-title" className="t-display mt-8 max-w-[13ch]">
            Notes on owning your sequencing.
          </h1>
          <p className="t-sub mt-6 max-w-[40rem]">
            What sales engagement tools cost, how they compare, and what it takes to run email, SMS
            and call sequences on infrastructure you control.
          </p>
          <p className="mt-6 font-mono text-[13px] text-muted-foreground">
            <a
              href="/blog/rss.xml"
              className="underline decoration-1 underline-offset-4 transition-colors hover:text-brand"
            >
              Subscribe by RSS
            </a>
          </p>
        </section>
        <section aria-label="Posts" className="wrap pb-20 sm:pb-28">
          {posts.length ? (
            <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
              {posts.map((p) => (
                <li key={p.slug}>
                  <PostCard post={p} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-lead">The first posts are on their way.</p>
          )}
        </section>
        <Cta n={null} />
      </main>
      <SiteFooter />
    </>
  );
}
