import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { ArrowRight, BookOpen, Braces, ListChecks, Rocket } from 'lucide-react';
import { ModuleLogo } from '@/components/logos';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { baseOptions, sectionLinks } from '@/lib/layout.shared';
import { homeJsonLd, jsonLdHtml, socialMetadata } from '@/lib/seo';
import { getPageImage, projectUrl, repoUrl, siteDescription } from '@/lib/shared';

const title = 'OpenSequence documentation: guides, API reference and SDKs';

export const metadata: Metadata = {
  title: { absolute: title },
  description: siteDescription,
  alternates: { canonical: '/' },
  ...socialMetadata({ title, description: siteDescription, url: '/', image: getPageImage([]).url }),
};

const developers = [
  { href: '/docs/developers/webhooks', title: 'Webhooks', text: 'signed events to your app', logo: 'webhook' },
  { href: '/docs/developers/mcp', title: 'MCP', text: 'for AI agents', logo: 'mcp' },
  { href: '/docs/developers/typescript-sdk', title: 'TypeScript SDK', text: 'npm install @opensequence/sdk', logo: 'typescript' },
];

const start = [
  { href: '/docs/get-started/quickstart', title: 'Quickstart', text: 'Run the server, create a project, connect a mailbox and enroll a first contact.', icon: Rocket },
  { href: '/docs/get-started/integrate', title: 'Integrate into your product', text: 'The checklist: one call per step, from senders to webhooks.', icon: ListChecks },
  { href: '/docs/concepts/project', title: 'Concepts', text: 'Project, sender, contact, attributes, sequence, node and run, one short page each.', icon: BookOpen },
  { href: '/api/conventions', title: 'API reference', text: 'Every endpoint, generated from the OpenAPI file.', icon: Braces },
];

const modules = [
  { href: '/docs/modules/email', title: 'Email', text: 'SMTP and IMAP', logo: 'email' },
  { href: '/docs/modules/email/gmail', title: 'Gmail', text: 'and Google Workspace', logo: 'gmail' },
  { href: '/docs/modules/email/outlook', title: 'Outlook', text: 'and Microsoft 365', logo: 'outlook' },
  { href: '/docs/modules/sms/allo', title: 'Allo', text: 'texts and call tasks', logo: 'allo' },
  { href: '/docs/modules/crm/attio', title: 'Attio', text: 'live CRM conditions', logo: 'attio' },
];

function FlowNode({ label, sub, strong }: { label: string; sub: string; strong?: boolean }) {
  return (
    <div
      className={`flow-node flex flex-col justify-center rounded-xl px-4 py-3 text-center ${strong ? 'border-fd-primary! bg-fd-primary/8! ring-1 ring-fd-primary/25' : ''}`}
    >
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-0.5 text-xs text-fd-muted-foreground">{sub}</div>
    </div>
  );
}

function Arrow({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-1 py-1 text-fd-primary md:py-0">
      <span className="font-mono text-[11px] text-fd-muted-foreground">{label}</span>
      <span aria-hidden="true" className="text-lg leading-none max-md:rotate-90">
        →
      </span>
    </div>
  );
}

/** Your CRM or app, the API, the engine, the sending modules, and the webhooks back. */
function FlowDiagram() {
  return (
    <figure className="rounded-2xl border border-fd-border bg-fd-muted/60 p-4 sm:p-6" aria-label="How OpenSequence fits: your app calls the API, the engine runs the sequence, providers send, webhooks report back">
      <div className="grid items-stretch gap-1 md:grid-cols-[1fr_auto_1fr_auto_1.15fr_auto_1fr]">
        <FlowNode label="Your CRM or app" sub="senders, contacts, triggers" />
        <Arrow label="REST / SDK" />
        <FlowNode label="OpenSequence API" sub="publish, enroll, exit" />
        <Arrow label="queue" />
        <FlowNode label="Engine" sub="planner, waits, gates, executors" strong />
        <Arrow label="send" />
        <div className="grid gap-1.5">
          <FlowNode label="SMTP · IMAP" sub="email" />
          <FlowNode label="Allo" sub="texts, dialer" />
        </div>
      </div>
      <div className="mt-4 flex flex-col items-center gap-2 border-t border-dashed border-fd-border pt-4 text-center text-sm text-fd-muted-foreground md:flex-row md:justify-center md:gap-3">
        <span>Replies, bounces, opt-outs and calls come back as signals</span>
        <span aria-hidden="true" className="text-fd-primary max-md:rotate-90">
          →
        </span>
        <span className="font-medium text-fd-foreground">signed webhooks to your app</span>
      </div>
    </figure>
  );
}

function Section({ title, kicker, children }: { title: string; kicker: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <div>
        <p className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-fd-primary">{kicker}</p>
        <h2 className="mt-1.5 text-2xl font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}

const card = 'group flex flex-col gap-1.5 rounded-xl border border-fd-border bg-fd-card p-5 transition-colors hover:border-fd-primary/60 hover:bg-fd-accent/60';

export default function HomePage() {
  return (
    <HomeLayout {...baseOptions()} links={sectionLinks}>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdHtml(homeJsonLd())} />
      <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-16 px-4 py-14 sm:px-8 md:py-20">
        <header className="flex flex-col gap-6">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-fd-primary">Documentation</p>
          <h1 className="text-5xl leading-none font-semibold tracking-[-0.045em] sm:text-6xl">OpenSequence docs</h1>
          <p className="max-w-2xl text-base leading-relaxed text-fd-muted-foreground sm:text-lg">
            OpenSequence is an open source, self-hosted API that runs sales sequences of email, SMS and call tasks for any
            CRM. You publish a sequence and enroll contacts. It sends from each rep&rsquo;s own mailbox and number.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/docs/get-started/quickstart" className="inline-flex items-center gap-2 rounded-lg bg-fd-primary px-4 py-2.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90">
              Start the quickstart <ArrowRight className="size-4" />
            </Link>
            <Link href="/docs/modules" className="inline-flex items-center gap-2 rounded-lg border border-fd-border bg-fd-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-fd-accent">
              Browse the modules
            </Link>
          </div>
        </header>

        <FlowDiagram />

        <Section kicker="Start here" title="Start here">
          <div className="grid gap-4 sm:grid-cols-2">
            {start.map((e) => (
              <Link key={e.href} href={e.href} className={card}>
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-fd-primary/10 text-fd-primary">
                    <e.icon className="size-4" />
                  </span>
                  <span className="font-semibold">{e.title}</span>
                </div>
                <p className="text-sm leading-relaxed text-fd-muted-foreground">{e.text}</p>
              </Link>
            ))}
          </div>
        </Section>

        <Section kicker="Modules" title="What a sequence can use">
          <div className="flex flex-wrap gap-2.5">
            {modules.map((m) => (
              <Link key={m.href} href={m.href} className="inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-card py-1.5 pr-4 pl-2 text-sm transition-colors hover:border-fd-primary/60 hover:bg-fd-accent/60">
                <ModuleLogo name={m.logo} size={22} />
                <span className="font-semibold">{m.title}</span> <span className="text-fd-muted-foreground">{m.text}</span>
              </Link>
            ))}
          </div>
          <p className="text-xs text-fd-muted-foreground">Logos identify each integration and imply no endorsement.</p>
        </Section>

        <Section kicker="Developers" title="Build on it">
          <div className="flex flex-wrap gap-2.5">
            {developers.map((m) => (
              <Link key={m.href} href={m.href} className="inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-card py-1.5 pr-4 pl-2 text-sm transition-colors hover:border-fd-primary/60 hover:bg-fd-accent/60">
                <ModuleLogo name={m.logo} size={22} />
                <span className="font-semibold">{m.title}</span> <span className="text-fd-muted-foreground">{m.text}</span>
              </Link>
            ))}
          </div>
        </Section>

        <footer className="grid gap-8 border-t border-fd-border pt-10 text-sm sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <p className="font-semibold">Run it</p>
            <Link className="text-fd-muted-foreground hover:text-fd-foreground" href="/docs/self-hosting/install">Self-hosting</Link>
            <Link className="text-fd-muted-foreground hover:text-fd-foreground" href="/docs/self-hosting/database">Database</Link>
            <Link className="text-fd-muted-foreground hover:text-fd-foreground" href="/docs/self-hosting/configuration">Configuration</Link>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-semibold">Build on it</p>
            <Link className="text-fd-muted-foreground hover:text-fd-foreground" href="/docs/developers/typescript-sdk">TypeScript SDK</Link>
            <Link className="text-fd-muted-foreground hover:text-fd-foreground" href="/docs/developers/mcp">MCP server</Link>
            <Link className="text-fd-muted-foreground hover:text-fd-foreground" href="/docs/developers/webhooks">Webhooks</Link>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-semibold">For agents and tools</p>
            <a className="text-fd-muted-foreground hover:text-fd-foreground" href="/llms.txt">llms.txt</a>
            <a className="text-fd-muted-foreground hover:text-fd-foreground" href="/llms-full.txt">llms-full.txt</a>
            <a className="text-fd-muted-foreground hover:text-fd-foreground" href="/openapi.json">openapi.json</a>
          </div>
          <p className="text-fd-muted-foreground sm:col-span-3">
            Product site: <a className="underline underline-offset-2" href={projectUrl}>opensequence.dev</a>. Source:{' '}
            <a className="underline underline-offset-2" href={repoUrl}>GitHub</a>. Apache-2.0.
          </p>
        </footer>
      </main>
    </HomeLayout>
  );
}
