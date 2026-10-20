import { getAllPosts } from '@/lib/blog';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

/** The site in llms.txt format: what OpenSequence is, where the docs and source live, and the blog. */
const intro = `# OpenSequence

> Open source, self-hosted sales sequencing for any CRM. Multi-step email, SMS and call-task sequences, sent through each rep's own mailbox, with replies, exits, webhooks and analytics behind an API, a TypeScript SDK and an MCP server. Apache-2.0.

OpenSequence is an alternative to the sequencing part of Outreach, Salesloft, Apollo, lemlist and Customer.io. It runs as one Docker image on a Postgres you own; there is no per-seat price.

`;

const reference = `## Docs

- [Documentation](https://docs.opensequence.dev): guides, API reference, SDK and CLI
- [Docs for LLMs](https://docs.opensequence.dev/llms.txt): the docs index in llms.txt format
- [Docs, full text](https://docs.opensequence.dev/llms-full.txt): every docs page in one file
- [Quickstart](https://docs.opensequence.dev/docs/get-started/quickstart)
- [API reference](https://docs.opensequence.dev/api/conventions)
- [TypeScript SDK](https://docs.opensequence.dev/sdks/typescript)

## Source

- [GitHub repository](https://github.com/lguerberg/open-sequence)
- [Architecture](https://github.com/lguerberg/open-sequence/blob/main/docs/ARCHITECTURE.md)
`;

export async function GET() {
  const posts = await getAllPosts();
  const blog = posts.length
    ? [
        '## Blog',
        '',
        `- [Blog index](${SITE_URL}/blog): every post, newest first ([RSS](${SITE_URL}/blog/rss.xml))`,
        ...posts.map((p) => `- [${p.h1}](${SITE_URL}/blog/${p.slug}): ${p.description}`),
        '',
      ].join('\n')
    : '';
  const body = `${intro}${reference}${blog ? `\n${blog}` : ''}`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
