import { siteDescription, siteUrl } from '@/lib/shared';
import { docsLlms } from '@/lib/source';

export const revalidate = false;

const header = `# OpenSequence

> ${siteDescription}

Adding OpenSequence to a product? Start with ${siteUrl}/docs/integrate: the questions to ask the user first, every API call in order, the events to handle and the admin screens to build in your own design system. Then ${siteUrl}/docs/community/faq for the questions integrators ask next.

Every page below is also available as Markdown at ${siteUrl}/llms.mdx/<page path>/content.md. The whole site in one file: ${siteUrl}/llms-full.txt. The OpenAPI document: ${siteUrl}/openapi.json.
`;

/**
 * `/llms.txt` (llmstxt.org): a title, a one-line summary, then the page index. The index's
 * top-level headings become sections (##) and its links absolute, so an agent can follow them as is.
 */
export async function GET() {
  const index = (await docsLlms.index()).replace(/^# /gm, '## ').replace(/\]\(\//g, `](${siteUrl}/`);
  return new Response(`${header}\n${index}`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
