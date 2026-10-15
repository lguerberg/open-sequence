import type { MetadataRoute } from 'next';
import { pageLastModified } from '@/lib/seo';
import { absoluteUrl } from '@/lib/shared';
import { source } from '@/lib/source';

export const dynamic = 'force-static';

/** `/sitemap.xml`: the home page and every docs page, hand-written, generated and API reference. */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = source.getPages();
  const latest = pages.map(pageLastModified).sort().at(-1);
  return [
    { url: absoluteUrl('/'), lastModified: latest, changeFrequency: 'weekly', priority: 1 },
    ...pages.map((page) => ({
      url: absoluteUrl(page.url),
      lastModified: pageLastModified(page),
      changeFrequency: 'weekly' as const,
      priority: page.type === 'openapi' ? 0.5 : 0.8,
    })),
  ];
}
