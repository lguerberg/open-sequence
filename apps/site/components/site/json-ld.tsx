import { faq } from '@/lib/content';
import { DOCS, GITHUB } from '@/lib/links';
import { SITE_DESCRIPTION, SITE_NAME, SITE_SUMMARY, SITE_URL } from '@/lib/site';

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
        sameAs: [GITHUB, 'https://www.npmjs.com/package/@opensequence/sdk'],
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
        applicationSubCategory: 'Outreach sequence engine',
        operatingSystem: 'Linux, Docker',
        url: SITE_URL,
        image: `${SITE_URL}/og.png`,
        description: `${SITE_SUMMARY} Used for sales prospecting, recruiting, customer onboarding, renewals, partnerships and AI agents. An open source alternative to the sequencing in Outreach, Salesloft, Apollo and lemlist.`,
        featureList: [
          'Multi-step email, SMS, call-task and LinkedIn sequences',
          "Sends from each sender's own mailbox over SMTP, reads replies over IMAP",
          'Stops on reply, bounce, opt-out and booked meeting',
          "Send windows and quiet hours in each contact's time zone",
          'Versioned JSON sequence definitions',
          'REST API, TypeScript SDK, CLI and MCP server',
          'Signed webhooks (Standard Webhooks)',
          'Multi-tenant projects with scoped API keys',
          'Per-step analytics with reply attribution',
        ],
        keywords:
          'open source sequences, sequence engine, email sequence API, outreach automation, self-hosted sales engagement, recruiting outreach, customer onboarding sequences',
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
