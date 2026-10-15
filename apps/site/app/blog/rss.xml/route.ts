import { BLOG_DESCRIPTION, getAllPosts } from '@/lib/blog';
import { SITE_NAME, SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const rfc822 = (iso: string) => new Date(`${iso}T00:00:00Z`).toUTCString();

/** The full post in each item, so feed readers show the article, not a teaser. */
const cdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;

/** Feed readers do not know the site's origin: root-relative links become absolute. */
const absolute = (html: string) => html.replace(/(href|src)="\//g, `$1="${SITE_URL}/`);

export async function GET() {
  const posts = await getAllPosts();
  const feed = `${SITE_URL}/blog/rss.xml`;
  const lastBuild = posts
    .map((p) => p.updated)
    .sort()
    .at(-1);
  const items = posts
    .map((p) => {
      const url = `${SITE_URL}/blog/${p.slug}`;
      return [
        '    <item>',
        `      <title>${escape(p.h1)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        `      <pubDate>${rfc822(p.date)}</pubDate>`,
        `      <dc:creator>${escape(p.author)}</dc:creator>`,
        `      <description>${escape(p.description)}</description>`,
        ...p.tags.map((t) => `      <category>${escape(t)}</category>`),
        `      <content:encoded>${cdata(absolute(p.html))}</content:encoded>`,
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${SITE_NAME} blog</title>
    <link>${SITE_URL}/blog</link>
    <description>${escape(BLOG_DESCRIPTION)}</description>
    <language>en</language>
    <atom:link href="${feed}" rel="self" type="application/rss+xml" />
    <image>
      <url>${SITE_URL}/icon-192.png</url>
      <title>${SITE_NAME} blog</title>
      <link>${SITE_URL}/blog</link>
    </image>${lastBuild ? `\n    <lastBuildDate>${rfc822(lastBuild)}</lastBuildDate>` : ''}
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
