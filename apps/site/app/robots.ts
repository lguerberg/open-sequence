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

/** Everything is public except the design-system page, which is noindex. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: namedCrawlers, allow: '/', disallow: '/design' },
      { userAgent: '*', allow: '/', disallow: '/design' },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
