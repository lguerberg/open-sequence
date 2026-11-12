import { getAllPosts } from '@/lib/blog';
import { DOCS, GITHUB } from '@/lib/links';
import { SITE_SUMMARY, SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

/** `/llms.txt` (llmstxt.org): what OpenSequence is, then where the docs, the guides and the source live. */
const intro = `# OpenSequence

> ${SITE_SUMMARY} One Docker image on your own Postgres, no per-seat price, Apache-2.0. Install the client with \`npm install @opensequence/sdk\`.

Teams use it for any one-to-one, multi-step outreach: sales prospecting, recruiting and candidate outreach, customer onboarding check-ins, renewals and expansion, partner and investor outreach, event follow-up, and as the sending backend for AI agents (through MCP with an enroll-scoped key). SaaS platforms embed it to ship sequences as a feature, with one project per customer. It replaces the sequencing part of Outreach, Salesloft, Apollo and lemlist. It is not a newsletter or marketing email tool, a contact database or an inbox warm-up service.

## Docs

- [Docs index for LLMs](${DOCS}/llms.txt): every docs page in reading order, one line each
- [Docs, full text](${DOCS}/llms-full.txt): every docs page in one file
- [Quickstart](${DOCS}/docs/get-started/quickstart): run the server, create a project, connect a mailbox and enroll a first contact
- [Integrate OpenSequence into your product](${DOCS}/docs/get-started/integrate): the checklist, one call per step
- [Modules](${DOCS}/docs/modules): what a sequence can use: email (Gmail, Outlook, any SMTP), SMS, AI agent calls and call tasks with Allo, LinkedIn connection requests, CRM conditions with Attio
- [Webhooks](${DOCS}/docs/webhooks): signed events back to your app
- [TypeScript SDK reference](${DOCS}/sdks/typescript): every method of @opensequence/sdk

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
