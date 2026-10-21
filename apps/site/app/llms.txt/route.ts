import { getAllPosts } from '@/lib/blog';
import { DOCS, GITHUB } from '@/lib/links';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

/** `/llms.txt` (llmstxt.org): what OpenSequence is, then where the docs, the guides and the source live. */
const intro = `# OpenSequence

> OpenSequence is an open source, self-hosted API that runs sales sequences of email, SMS and call tasks for any CRM. It is an alternative to the sequencing part of Outreach, Salesloft, Apollo and lemlist: one Docker image on your own Postgres, no per-seat price, Apache-2.0. Install the client with \`npm install @opensequence/sdk\`.

## Docs

- [Docs index for LLMs](${DOCS}/llms.txt): every docs page in reading order, one line each
- [Docs, full text](${DOCS}/llms-full.txt): every docs page in one file
- [Quickstart](${DOCS}/docs/get-started/quickstart): run the server, create a project, connect a mailbox and enroll a first contact
- [Integrate OpenSequence into your product](${DOCS}/docs/get-started/integrate): the checklist, one call per step
- [Modules](${DOCS}/docs/modules): what a sequence can use: email (Gmail, Outlook, any SMTP), SMS with Allo, CRM conditions with Attio
- [Developers](${DOCS}/docs/developers/webhooks): webhooks to your app, the MCP server for AI agents and the TypeScript SDK

## Source

- [GitHub repository](${GITHUB})
- [TypeScript SDK on npm](https://www.npmjs.com/package/@opensequence/sdk)
`;

export async function GET() {
  // Guides first: they answer one question end to end.
  const posts = [...(await getAllPosts())].sort(
    (a, b) => Number(b.kind === 'guide') - Number(a.kind === 'guide')
  );
  const guides = posts.length
    ? [
        '',
        '## Guides',
        '',
        ...posts.map((p) => `- [${p.h1}](${SITE_URL}/blog/${p.slug}): ${p.description}`),
      ].join('\n')
    : '';
  return new Response(`${intro}${guides}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
