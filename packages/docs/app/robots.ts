import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/shared';

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

/** `/robots.txt`: everything is public except the static search index, which is data, not a page. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: namedCrawlers, allow: '/', disallow: ['/api/search'] },
      { userAgent: '*', allow: '/', disallow: ['/api/search'] },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
