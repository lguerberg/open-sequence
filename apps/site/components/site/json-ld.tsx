import { faq } from '@/lib/content';
import { DOCS, GITHUB } from '@/lib/links';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';

/**
 * Structured data: the organization and the site, the product as a free software application, and
 * the FAQ. One graph, so the entities reference each other by @id.
 */
export function JsonLd() {
  const org = `${SITE_URL}/#organization`;
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': org,
        name: SITE_NAME,
        url: SITE_URL,
        logo: { '@type': 'ImageObject', url: `${SITE_URL}/icon-512.png`, width: 512, height: 512 },
        sameAs: [GITHUB],
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        publisher: { '@id': org },
        inLanguage: 'en',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}/#software`,
        name: SITE_NAME,
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Sales engagement',
        operatingSystem: 'Linux, Docker',
        url: SITE_URL,
        image: `${SITE_URL}/og.png`,
        description:
          "Open source, self-hosted sales sequencing for any CRM: multi-step email, SMS and call-task sequences sent through each rep's own accounts, configured through an API, a TypeScript SDK or MCP. An alternative to Outreach, Salesloft, Apollo, lemlist and Customer.io.",
        license: 'https://www.apache.org/licenses/LICENSE-2.0',
        softwareHelp: { '@type': 'CreativeWork', url: DOCS },
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        publisher: { '@id': org },
      },
      {
        '@type': 'SoftwareSourceCode',
        '@id': `${SITE_URL}/#source`,
        name: 'open-sequence',
        codeRepository: GITHUB,
        programmingLanguage: 'TypeScript',
        license: 'https://www.apache.org/licenses/LICENSE-2.0',
        targetProduct: { '@id': `${SITE_URL}/#software` },
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE_URL}/#faq`,
        mainEntity: faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}
