import type { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/blog';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

/**
 * The landing, the blog index and every post. The design-system page is noindex and left out. The
 * docs have their own sitemap. A post's lastModified is its `updated` date, so it only moves when
 * the post does.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getAllPosts();
  const latest = posts
    .map((p) => p.updated)
    .sort()
    .at(-1);
  return [
    { url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    {
      url: `${SITE_URL}/blog`,
      ...(latest ? { lastModified: latest } : {}),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    ...posts.map((p) => ({
      url: `${SITE_URL}/blog/${p.slug}`,
      lastModified: p.updated,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];
}
