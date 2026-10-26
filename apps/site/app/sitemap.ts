import { execFileSync } from 'node:child_process';
import type { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/blog';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

/** The files the home page is built from, relative to this app's folder. */
const homeSources = [
  'app/page.tsx',
  'app/layout.tsx',
  'components/site',
  'components/ds',
  'lib/content.ts',
  'lib/site.ts',
];

/**
 * When the home page last changed: the last commit that touched its sources. Google ignores a
 * lastmod that moves on every build, so the build time is only the fallback outside a git checkout.
 */
function homeLastModified(): string {
  try {
    const date = execFileSync('git', ['log', '-1', '--format=%cI', '--', ...homeSources], {
      encoding: 'utf8',
    }).trim();
    if (date) return date;
  } catch {
    // Not a git checkout (or no git).
  }
  return new Date().toISOString();
}

/**
 * The landing, the blog index and every post. The design-system page is noindex and left out. The
 * docs have their own sitemap. A post's lastModified is its `updated` date, so it only moves when
 * the post does. The home URL is written the way its canonical tag writes it, without a slash.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getAllPosts();
  const latest = posts
    .map((p) => p.updated)
    .sort()
    .at(-1);
  return [
    { url: SITE_URL, lastModified: homeLastModified(), changeFrequency: 'weekly', priority: 1 },
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
