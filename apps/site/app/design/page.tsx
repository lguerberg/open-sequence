import type { Metadata } from 'next';
import { ArrowRight, Braces, Mail, PhoneCall, Webhook } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Accordion } from '@/components/ds/accordion';
import { Logo } from '@/components/ds/brand';
import { CodeWindow } from '@/components/ds/code-card';
import { CopyCommand } from '@/components/ds/controls';
import { Card, Section, SectionHeading } from '@/components/ds/frame';
import { Badge, Chip, Dot, IconTile, Label, Mark } from '@/components/ds/marks';
import { Tabs } from '@/components/ds/tabs';

export const metadata: Metadata = {
  title: 'Design system',
  robots: { index: false, follow: false },
};

const palette: Array<[token: string, hex: string, use: string]> = [
  ['background', '#FFFFFF', 'the ground'],
  ['surface', '#F3F8FD', 'cards, the nav pill'],
  ['peri', '#DDEBF8', 'the tinted band, the selected tab'],
  ['border', '#DBE6F1', 'hairlines'],
  ['foreground', '#0F1B2A', 'navy ink, icon discs, text on celeste, the footer'],
  ['ink-2', '#3C4A5C', 'subheads, ledes'],
  ['muted-foreground', '#66758A', 'meta, secondary mono'],
  ['brand', '#2B7BC0', 'deep celeste: the primary button, links, section numbers'],
  ['band', '#74ACDF', 'celeste: the hero band, card backs'],
  ['sky', '#A9CFF0', 'light celeste: the closing band, the product frame'],
  ['brand-soft', '#E3F0FB', 'soft fills'],
  ['code', '#0F1B2A', 'the code window'],
  ['lime', '#8EC3EE', 'the file tag on code'],
];

const typeScale: Array<[cls: string, spec: string, sample: string]> = [
  ['t-display', 'Geist 600 · 48 to 96 · -0.05em', 'Sales sequences, as code.'],
  ['t-sub', 'Geist 400 · 19 to 24 · -0.02em', 'Own your sales sequencing infrastructure.'],
  ['t-h2', 'Geist 600 · 32 to 46 · -0.04em', 'Why teams own their sequencing'],
  ['t-h3', 'Geist 500 · 21 · -0.025em', 'Headless by design'],
  ['t-lead', 'Geist 400 · 17 to 19', 'Price is the obvious reason. Here are the others.'],
  [
    't-body',
    'JetBrains Mono 400 · 14 / 1.55',
    'Every step has an idempotency key and its own Message-ID.',
  ],
  ['t-label', 'JetBrains Mono 500 · 12 · 0.1em · uppercase', 'Use cases'],
];

const snippet = `import { OpenSequence } from '@opensequence/sdk';

const oseq = new OpenSequence({ baseUrl: process.env.SEQ_URL!, apiKey: process.env.SEQ_KEY! });
await oseq.sequences.enroll('seq_01J9', { contacts: ['dana'], sender: 'max' });`;

/** The system on one page: tokens, type, then every component the landing uses. */
export default function DesignPage() {
  return (
    <main>
      <header className="wrap flex h-24 items-center justify-between">
        <Logo />
        <span className="font-mono text-[13px] text-muted-foreground">design system</span>
      </header>

      <Section labelledBy="ds-color" inner="py-16">
        <SectionHeading id="ds-color" label="Color" title="Celeste and white, navy ink" />
        <ul className="m-0 mt-10 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {palette.map(([token, hex, use]) => (
            <Card as="li" key={token} className="flex items-center gap-4">
              <span
                className="size-14 shrink-0 rounded-2xl border border-border"
                style={{ background: hex }}
              />
              <span className="min-w-0">
                <span className="block font-mono text-[13px] text-foreground">{token}</span>
                <span className="block font-mono text-[12px] text-muted-foreground">{hex}</span>
                <span className="block truncate text-[14px] text-ink-2">{use}</span>
              </span>
            </Card>
          ))}
        </ul>
      </Section>

      <Section labelledBy="ds-type" inner="py-16">
        <SectionHeading id="ds-type" label="Type" title="Geist and JetBrains Mono" />
        <div className="mt-10 flex flex-col gap-4">
          {typeScale.map(([cls, spec, sample]) => (
            <Card
              key={cls}
              className="grid gap-3 p-6 md:grid-cols-[220px_minmax(0,1fr)] md:items-baseline"
            >
              <span className="font-mono text-[12px] text-muted-foreground">
                .{cls}
                <br />
                {spec}
              </span>
              <span className={cls}>{sample}</span>
            </Card>
          ))}
        </div>
      </Section>

      <Section labelledBy="ds-actions" inner="py-16">
        <SectionHeading id="ds-actions" label="Actions" title="Buttons, commands, links" />
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button size="lg">
            Get started <ArrowRight className="size-4" />
          </Button>
          <Button variant="light" size="lg">
            Start building
          </Button>
          <Button variant="soft" size="lg">
            Read the docs
          </Button>
          <Button variant="dark">Dark</Button>
          <Button variant="light" size="sm">
            Small
          </Button>
          <Button variant="link" size="inline">
            build vs. buy
          </Button>
        </div>
        <div className="mt-6 max-w-xl">
          <CopyCommand command="docker compose up" />
        </div>
        <div className="dots relative mt-6 overflow-hidden rounded-[28px] bg-band px-6 py-10 text-foreground sm:px-12">
          <p className="text-[32px] font-semibold tracking-[-0.035em]">The celeste band</p>
          <div className="mt-6 max-w-xl">
            <CopyCommand
              tone="band"
              command="Add sales sequences to my app: docs.opensequence.dev/llms.txt"
            />
          </div>
        </div>
      </Section>

      <Section labelledBy="ds-marks" inner="py-16">
        <SectionHeading id="ds-marks" label="Marks" title="Labels, chips, badges, tiles" />
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Label n="01">Features</Label>
          <Label>Plain</Label>
          <Mark />
          <Chip>email</Chip>
          <Chip>sms</Chip>
          <Badge tone="done">done</Badge>
          <Badge tone="wait">wait</Badge>
          <Badge tone="reply">reply</Badge>
          <Badge tone="failed">failed</Badge>
          <Badge tone="exit">exited</Badge>
          <Dot tone="ok" />
          <IconTile icon={Mail} size="sm" />
          <IconTile icon={PhoneCall} />
          <IconTile icon={Webhook} size="lg" />
        </div>
      </Section>

      <Section labelledBy="ds-cards" inner="py-16">
        <SectionHeading
          id="ds-cards"
          label="Surfaces"
          title="Cards, the code window, tabs, accordion"
        />
        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <Card className="flex flex-col gap-5 p-6">
            <div className="flex items-center gap-4">
              <IconTile icon={Braces} />
              <h3 className="t-h3">A feature card</h3>
            </div>
            <p className="t-body">
              Rounded 32px on the ground, an ink tile, a light headline and mono copy.
            </p>
          </Card>
          <CodeWindow tag="enroll.ts" meta="@opensequence/sdk" code={snippet} lang="typescript" />
          <Card className="p-6">
            <Tabs
              name="ds-tabs"
              items={[
                { id: 'a', label: 'Email', panel: <p className="t-body mt-4">An email step.</p> },
                { id: 'b', label: 'Wait', panel: <p className="t-body mt-4">A wait step.</p> },
                {
                  id: 'c',
                  label: 'Task',
                  panel: <p className="t-body mt-4">A task for the rep.</p>,
                },
              ]}
            />
          </Card>
          <Card className="px-6 py-2">
            <Accordion
              name="ds-faq"
              items={[
                { q: 'Is it open source?', a: 'Yes, Apache-2.0.' },
                { q: 'What does it need?', a: 'Postgres 14 or newer.' },
              ]}
            />
          </Card>
        </div>
      </Section>
    </main>
  );
}
