import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

/** Search and AI crawlers that are welcome by name, so a blanket rule elsewhere never shuts them out. */
const namedCrawlers = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'PerplexityBot',
  'Google-Extended',
  'Bingbot',
  'Applebot-Extended',
  'CCBot',
];

/**
 * Everything is open to crawl. The design-system page is kept out of search by its noindex meta tag,
 * not here: a crawler blocked by robots.txt never reads that tag, and Google can still index a
 * blocked URL from links alone.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: namedCrawlers, allow: '/' },
      { userAgent: '*', allow: '/' },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
