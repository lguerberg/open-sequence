import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PostJsonLd } from '@/components/blog/json-ld';
import {
  Breadcrumb,
  PostCard,
  PostMeta,
  Tags,
  TocAside,
  TocDisclosure,
} from '@/components/blog/parts';
import { Cta } from '@/components/site/cta';
import { SiteFooter } from '@/components/site/footer';
import { SiteHeader } from '@/components/site/header';
import { documentTitle, getAllPosts, getPost, relatedPosts } from '@/lib/blog';
import { SITE_NAME } from '@/lib/site';

export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return (await getAllPosts()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost((await params).slug);
  if (!post) return {};
  const url = `/blog/${post.slug}`;
  const image = { url: `${url}/og.png`, width: 1200, height: 630, alt: post.h1 };
  return {
    title: { absolute: documentTitle(post) },
    description: post.description,
    keywords: [post.keyword, ...post.tags].filter((k): k is string => Boolean(k)),
    authors: [{ name: post.author }],
    alternates: {
      canonical: url,
      types: { 'application/rss+xml': [{ url: '/blog/rss.xml', title: `${SITE_NAME} blog` }] },
    },
    openGraph: {
      type: 'article',
      title: post.h1,
      description: post.description,
      url,
      siteName: SITE_NAME,
      locale: 'en_US',
      publishedTime: post.date,
      modifiedTime: post.updated,
      authors: [post.author],
      tags: post.tags,
      images: [{ ...image, type: 'image/png' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.h1,
      description: post.description,
      images: [image],
    },
  };
}

export default async function PostPage({ params }: Props) {
  const post = await getPost((await params).slug);
  if (!post) notFound();
  const related = relatedPosts(post, await getAllPosts());

  return (
    <>
      <PostJsonLd post={post} />
      <SiteHeader />
      <main>
        <div className="wrap pt-4 pb-20 sm:pt-8 sm:pb-28">
          <Breadcrumb title={post.h1} />
          <header className="mt-10 max-w-[56rem] sm:mt-14">
            <h1 className="font-display text-[clamp(42px,5.6vw,76px)] leading-[0.98] tracking-[-0.02em]">
              {post.h1}
            </h1>
            <p className="t-sub mt-6 max-w-[44rem]">{post.description}</p>
            <div className="mt-8 flex flex-col gap-4">
              <PostMeta post={post} />
              <Tags tags={post.tags} />
            </div>
          </header>
          <div className="mt-12 grid gap-12 border-t border-border pt-12 sm:mt-14 lg:grid-cols-[minmax(0,1fr)_248px] lg:gap-16">
            <div className="min-w-0">
              <TocDisclosure toc={post.toc} />
              <article className="prose-blog" dangerouslySetInnerHTML={{ __html: post.html }} />
            </div>
            <aside className="hidden lg:block">
              <TocAside toc={post.toc} />
            </aside>
          </div>
        </div>
        {related.length ? (
          <section
            aria-labelledby="related-title"
            className="border-t border-border py-16 sm:py-24"
          >
            <div className="wrap">
              <h2 id="related-title" className="t-h2">
                Related posts
              </h2>
              <ul className="m-0 mt-10 grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
                {related.map((p) => (
                  <li key={p.slug}>
                    <PostCard post={p} headingLevel="h3" />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}
        <Cta n={null} />
      </main>
      <SiteFooter />
    </>
  );
}
