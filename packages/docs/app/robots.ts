import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/shared';

export const dynamic = 'force-static';

/** `/robots.txt`: everything is public except the static search index, which is data, not a page. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/search'] }],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
