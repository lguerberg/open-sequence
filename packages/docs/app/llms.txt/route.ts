import type { Node } from 'fumadocs-core/page-tree';
import { projectUrl, siteUrl } from '@/lib/shared';
import { source } from '@/lib/source';

export const revalidate = false;

const intro = `# OpenSequence

> OpenSequence is an open source, self-hosted API that runs sales sequences of email, SMS and call tasks for any CRM. Your app upserts contacts and senders by its own ids, publishes versioned JSON sequences and enrolls people. The service schedules each step in the contact's time zone and sends from the rep's own mailbox or number. It stops on replies, bounces and opt-outs, and reports back through signed webhooks. Install the client with \`npm install @opensequence/sdk\`. Each page below is also Markdown at ${siteUrl}/llms.mdx/<page path>/content.md. The whole site is ${siteUrl}/llms-full.txt and every endpoint is in ${siteUrl}/openapi.json.
`;

/** The canonical guide lives on the product site. */
const guide = `## Guide

- [How to build a sales sequencing tool](${projectUrl}/blog/build-your-own-sales-sequencer): the seven parts, what breaks in each, and when to use an open source engine instead
`;

function urls(nodes: Node[]): string[] {
  return nodes.flatMap((node) => {
    if (node.type === 'page') return [node.url];
    if (node.type === 'folder') return [...(node.index ? [node.index.url] : []), ...urls(node.children)];
    return [];
  });
}

/**
 * `/llms.txt` (llmstxt.org): one paragraph on what OpenSequence is, then every page in sidebar
 * order (Get started, Concepts, Modules, Developers, Analytics, Self-hosting, Security, then the
 * references), one line each. The per-endpoint API pages are left out: openapi.json has them.
 */
export async function GET() {
  const pages = new Map(source.getPages().filter((p) => p.type !== 'openapi').map((p) => [p.url, p]));
  const order = [...new Set(urls(source.getPageTree().children))].filter((url) => pages.has(url));
  const lines = order.map((url) => {
    const page = pages.get(url)!;
    return `- [${page.data.title}](${siteUrl}${url}): ${page.data.description ?? ''}`;
  });
  return new Response(`${intro}\n## Docs, in reading order\n\n${lines.join('\n')}\n\n${guide}`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
