import { HomeLayout } from 'fumadocs-ui/layouts/home';
import Link from 'next/link';
import { baseOptions, sectionLinks } from '@/lib/layout.shared';

const entries = [
  { href: '/docs/get-started/quickstart', title: 'Quickstart', text: 'Six calls from docker compose up to a first enrollment.' },
  { href: '/docs', title: 'Docs', text: 'Senders, contacts, sequences, enrollments, webhooks, analytics, self-hosting.' },
  { href: '/api/conventions', title: 'API reference', text: 'Every endpoint, with a playground against your own instance.' },
  { href: '/sdks/typescript', title: 'SDKs and CLI', text: '@opensequence/sdk, @opensequence/auth and the oseq CLI.' },
  { href: '/reference/glossary', title: 'Reference', text: 'The definition schema, condition fields, webhook events, configuration and error codes, generated from the code.' },
];

export default function HomePage() {
  return (
    <HomeLayout {...baseOptions()} links={sectionLinks}>
      <main className="container mx-auto flex flex-1 flex-col justify-center gap-10 px-6 py-16 max-w-4xl">
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold tracking-tight">OpenSequence documentation</h1>
          <p className="text-lg text-fd-muted-foreground max-w-2xl">
            A self-hosted service that runs multi-step outreach sequences (email, SMS, calls, tasks) for any CRM. Your
            application registers senders and contacts, publishes a sequence as JSON, enrolls contacts and gets told what
            happened. OpenSequence does the rest.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {entries.map((e) => (
            <Link key={e.href} href={e.href} className="rounded-xl border border-fd-border bg-fd-card p-5 transition-colors hover:bg-fd-accent">
              <div className="font-medium">{e.title}</div>
              <p className="mt-1 text-sm text-fd-muted-foreground">{e.text}</p>
            </Link>
          ))}
        </div>
      </main>
    </HomeLayout>
  );
}
