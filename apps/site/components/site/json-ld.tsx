import { faq } from '@/lib/content';
import { GITHUB } from '@/lib/links';

/** Structured data for the product and the FAQ. Kept as JSON (not a script) by the preview tool. */
export function JsonLd() {
  const data = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'OpenSequence',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Sales engagement',
      operatingSystem: 'Linux, Docker',
      url: 'https://opensequence.dev',
      description: 'Open source, self-hosted sales sequencing service for any CRM: multi-step email, SMS and call-task sequences through each rep’s own accounts, configured entirely through an API and MCP. An alternative to Apollo, Lemlist and Outreach sequences.',
      license: 'https://www.apache.org/licenses/LICENSE-2.0',
      codeRepository: GITHUB,
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@type': 'Organization', name: 'OpenSequence', url: 'https://opensequence.dev' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
  ];
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
