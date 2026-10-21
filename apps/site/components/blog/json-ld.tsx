import { BLOG_DESCRIPTION, type Post } from '@/lib/blog';
import { GITHUB } from '@/lib/links';
import { SITE_NAME, SITE_URL } from '@/lib/site';

const BLOG_URL = `${SITE_URL}/blog`;

const organization = {
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: SITE_URL,
  logo: { '@type': 'ImageObject', url: `${SITE_URL}/icon-512.png`, width: 512, height: 512 },
};

function breadcrumb(items: { name: string; url: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** `<` is escaped so no string in the data can close the script element. */
function Script({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

/** The blog index: the Blog with its posts, and the breadcrumb. */
export function BlogJsonLd({ posts }: { posts: Post[] }) {
  return (
    <Script
      data={{
        '@context': 'https://schema.org',
        '@graph': [
          organization,
          {
            '@type': 'Blog',
            '@id': `${BLOG_URL}#blog`,
            name: `${SITE_NAME} blog`,
            url: BLOG_URL,
            description: BLOG_DESCRIPTION,
            inLanguage: 'en',
            publisher: { '@id': organization['@id'] },
            blogPost: posts.map((p) => ({
              '@type': 'BlogPosting',
              headline: p.h1,
              url: `${BLOG_URL}/${p.slug}`,
              datePublished: p.date,
              dateModified: p.updated,
            })),
          },
          breadcrumb([
            { name: 'Home', url: `${SITE_URL}/` },
            { name: 'Blog', url: BLOG_URL },
          ]),
        ],
      }}
    />
  );
}

/**
 * One post: the BlogPosting (also a TechArticle when the post is a guide), the breadcrumb and,
 * when the post has a `## FAQ`, the FAQPage.
 */
export function PostJsonLd({ post }: { post: Post }) {
  const url = `${BLOG_URL}/${post.slug}`;
  const keywords = [post.keyword, ...post.tags].filter(Boolean);
  return (
    <Script
      data={{
        '@context': 'https://schema.org',
        '@graph': [
          organization,
          {
            '@type': post.kind === 'guide' ? ['BlogPosting', 'TechArticle'] : 'BlogPosting',
            '@id': `${url}#article`,
            ...(post.kind === 'guide'
              ? {
                  proficiencyLevel: 'Expert',
                  about: { '@type': 'Thing', name: post.keyword ?? post.title },
                  mentions: {
                    '@type': 'SoftwareSourceCode',
                    name: SITE_NAME,
                    codeRepository: GITHUB,
                    programmingLanguage: 'TypeScript',
                    license: 'https://www.apache.org/licenses/LICENSE-2.0',
                  },
                }
              : {}),
            headline: post.h1,
            description: post.description,
            datePublished: post.date,
            dateModified: post.updated,
            author: { '@type': 'Person', name: post.author },
            publisher: { '@id': organization['@id'] },
            image: {
              '@type': 'ImageObject',
              url: `${url}/og.png`,
              width: 1200,
              height: 630,
            },
            mainEntityOfPage: { '@type': 'WebPage', '@id': url },
            url,
            keywords: keywords.join(', '),
            wordCount: post.wordCount,
            inLanguage: 'en',
            isPartOf: { '@id': `${BLOG_URL}#blog` },
          },
          breadcrumb([
            { name: 'Home', url: `${SITE_URL}/` },
            { name: 'Blog', url: BLOG_URL },
            { name: post.h1, url },
          ]),
          ...(post.faq.length
            ? [
                {
                  '@type': 'FAQPage',
                  '@id': `${url}#faq`,
                  mainEntity: post.faq.map((f) => ({
                    '@type': 'Question',
                    name: f.q,
                    acceptedAnswer: { '@type': 'Answer', text: f.a },
                  })),
                },
              ]
            : []),
        ],
      }}
    />
  );
}
