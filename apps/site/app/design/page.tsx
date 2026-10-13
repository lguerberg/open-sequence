import type { Metadata } from 'next';
import { ArrowRight, Braces, KeyRound, Mail, PhoneCall, Webhook } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Accordion } from '@/components/ds/accordion';
import { Logo } from '@/components/ds/brand';
import { CodeCard } from '@/components/ds/code-card';
import { CopyCommand, ThemeToggle } from '@/components/ds/controls';
import { Band, Cells, Section, SectionHeading } from '@/components/ds/frame';
import { Chip, Dot, IconTile, Label } from '@/components/ds/marks';
import { Tabs } from '@/components/ds/tabs';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Design system',
  robots: { index: false, follow: false },
};

const palette: Array<[token: string, light: string, dark: string, use: string]> = [
  ['background', '#FAFAFA', '#0B0B0C', 'the page'],
  ['surface', '#FFFFFF', '#111113', 'cards, card headers, tiles'],
  ['surface-2', '#F2F4F7', '#18181B', 'hover, selected tab, chips'],
  ['code', '#FFFFFF', '#070708', 'code bodies'],
  ['foreground', '#0E1114', '#F4F4F5', 'type, primary button'],
  ['muted-foreground', '#5B626C', '#A1A1AA', 'body copy, secondary type'],
  ['subtle-foreground', '#8A919B', '#71717A', 'meta, timestamps'],
  ['border', '#D9DFE7', '#242427', 'every hairline'],
  ['brand', '#1677C7', '#5CB6F2', 'state only: sent, live, selected'],
];

const typeScale: Array<[cls: string, spec: string, sample: string]> = [
  ['t-display', 'Albert Sans 400 · 58/60 · −0.045em', 'Sales sequences, as code.'],
  ['t-h2', 'Albert Sans 400 · 38/43 · −0.035em', 'The sequencing feature, without the bill.'],
  ['t-h3', 'Albert Sans 500 · 18/24 · −0.01em', 'Sends through their own accounts'],
  [
    't-lead',
    'Albert Sans 400 · 19/30 · muted',
    "Self-host it, drive it through the API or MCP, and send from your reps' own Gmail and phone.",
  ],
  [
    't-body',
    'Albert Sans 400 · 15/25 · muted',
    'A reply, a booked meeting, a bounce or an opt-out finds the enrollment it belongs to and stops it.',
  ],
  ['t-label', 'IBM Plex Mono 500 · 12 · uppercase +0.06em', 'Developer-first'],
  [
    't-code',
    'IBM Plex Mono 400 · 13/22',
    "await oseq.sequences.enroll('uk-intro', { contacts: ['p_7'] })",
  ],
];

function Swatches({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div className={cn(theme, 'bg-background text-foreground')}>
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <Label>{theme === 'dark' ? 'Dark · default' : 'Light'}</Label>
        <Dot tone="brand" />
      </div>
      <ul className="divide-y divide-border">
        {palette.map(([token, light, dark, use]) => (
          <li key={token} className="grid grid-cols-[36px_1fr_auto] items-center gap-4 px-6 py-3">
            <span
              className="size-9 border border-border"
              style={{ background: `var(--${token})` }}
            />
            <span className="min-w-0">
              <span className="block font-mono text-[13px]">{token}</span>
              <span className="block truncate text-[13px] text-muted-foreground">{use}</span>
            </span>
            <span className="font-mono text-[12px] text-subtle-foreground tabular-nums">
              {theme === 'dark' ? dark : light}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Specimen({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div className={cn(theme, 'bg-background p-8 text-foreground sm:p-10')}>
      <Chip>Open source · Apache-2.0</Chip>
      <h3 className="t-display mt-6">Sales sequences, as code.</h3>
      <p className="t-lead mt-4 max-w-md">
        The sequencing feature, as a service you run. API first, MCP included.
      </p>
      <div className="mt-7 flex flex-wrap items-center gap-3">
        <Button>
          Start building <ArrowRight className="size-3.5" />
        </Button>
        <Button variant="outline">Read the docs</Button>
      </div>
    </div>
  );
}

export default async function DesignSystem() {
  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex h-[68px] max-w-[1440px] items-center justify-between px-5 sm:px-8">
          <Logo />
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-[12px] text-subtle-foreground sm:inline">
              design system · v1
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="top">
        <Section>
          <div className="px-6 py-16 sm:px-10 sm:py-20">
            <Label className="text-muted-foreground">OpenSequence · design system</Label>
            <h1 className="t-display mt-5 max-w-3xl">Classic, architectural, dev-first.</h1>
            <p className="t-lead mt-5 max-w-2xl">
              The page is a framed ledger: one column with hairline rails, sections stacked on
              full-width rules, content in cells that share their borders. Monochrome by default,
              ink on paper or paper on ink. One quiet azure, only for state.
            </p>
          </div>
          <Cells className="md:grid-cols-3">
            {[
              [
                'Architectural',
                'Hairlines, square cells, a fixed column. Structure carries the page, not shadows or gradients.',
              ],
              [
                'Monochrome, one state colour',
                'Buttons are ink. Azure marks what was sent, what is live and what is selected, nothing else.',
              ],
              [
                'Dev-first',
                'Code and identifiers are first-class: Plex Mono for every label, real requests in every example.',
              ],
            ].map(([t, d]) => (
              <div key={t} className="p-6 sm:p-8">
                <Label>{t}</Label>
                <p className="t-body mt-3">{d}</p>
              </div>
            ))}
          </Cells>
        </Section>

        <Band />

        <Section>
          <SectionHeading
            title="Colour"
            lede="Nine tokens per theme. Dark is the default; light is a full theme, not an inversion. Every component reads tokens, so either theme can be forced inside the other."
          />
          <Cells className="md:grid-cols-2">
            <Swatches theme="dark" />
            <Swatches theme="light" />
          </Cells>
        </Section>

        <Band />

        <Section>
          <SectionHeading
            title="Type"
            lede="Two faces. Albert Sans at regular weight with tight tracking for everything you read; IBM Plex Mono for code and the uppercase labels that name each cell. Five steps, nothing in between."
          />
          <ul className="divide-y divide-border">
            {typeScale.map(([cls, spec, sample]) => (
              <li
                key={cls}
                className="grid gap-3 px-6 py-6 sm:px-10 md:grid-cols-[220px_1fr] md:items-baseline md:gap-10"
              >
                <div>
                  <span className="block font-mono text-[13px] text-foreground">.{cls}</span>
                  <span className="block font-mono text-[12px] text-subtle-foreground">{spec}</span>
                </div>
                <p className={cn(cls, 'min-w-0 break-words')}>{sample}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Band />

        <Section>
          <SectionHeading title="Both themes, same components" />
          <Cells className="md:grid-cols-2">
            <Specimen theme="dark" />
            <Specimen theme="light" />
          </Cells>
        </Section>

        <Band />

        <Section>
          <SectionHeading
            title="Actions and marks"
            lede="Pills, uppercase, tracked. Primary is ink; outline is the hairline; the link is the underlined label. Chips, tiles and dots carry state."
          />
          <Cells className="md:grid-cols-2">
            <div className="flex flex-col gap-6 p-6 sm:p-10">
              <Label className="text-muted-foreground">Buttons</Label>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg">Start building</Button>
                <Button>Get started</Button>
                <Button size="sm">Sign up</Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" size="lg">
                  Read the docs
                </Button>
                <Button variant="outline">View on GitHub</Button>
                <Button variant="ghost">Changelog</Button>
                <Button variant="link" size="inline">
                  Learn more <ArrowRight className="size-3" />
                </Button>
              </div>
              <CopyCommand command="docker compose up" className="self-start" />
            </div>
            <div className="flex flex-col gap-6 p-6 sm:p-10">
              <Label className="text-muted-foreground">Chips, tiles, dots</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Chip>Step 01</Chip>
                <Chip>v0.1</Chip>
                <Chip tone="brand">
                  <Dot tone="brand" pulse /> Live
                </Chip>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <IconTile icon={Mail} size="lg" />
                <IconTile icon={PhoneCall} />
                <IconTile icon={Webhook} />
                <IconTile icon={KeyRound} size="sm" />
                <IconTile icon={Braces} size="sm" />
              </div>
              <div className="flex flex-wrap items-center gap-5 text-[14px] text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Dot tone="brand" /> sent
                </span>
                <span className="inline-flex items-center gap-2">
                  <Dot tone="ok" /> delivered
                </span>
                <span className="inline-flex items-center gap-2">
                  <Dot /> waiting
                </span>
                <span className="inline-flex items-center gap-2">
                  <Dot tone="ink" /> exited
                </span>
              </div>
            </div>
          </Cells>
        </Section>

        <Band />

        <Section>
          <SectionHeading
            title="Code, tabs, questions"
            lede="Code is highlighted at build time in both themes. Tabs and the accordion are HTML and CSS: they work before any script loads."
          />
          <Cells className="lg:grid-cols-2">
            <div className="p-6 sm:p-10">
              <CodeCard
                file="enroll.ts"
                meta="@opensequence/sdk"
                lang="typescript"
                code={`const oseq = new OpenSequence({ baseUrl, apiKey });\n\nawait oseq.sequences.enroll('uk-intro', {\n  contacts: ['p_7'],\n  sender: 'u_42',\n});`}
                footer={
                  <>
                    <span>Works with</span>
                    <Chip>Claude Code</Chip>
                    <Chip>Cursor</Chip>
                    <Chip>MCP</Chip>
                  </>
                }
              />
            </div>
            <div className="p-6 sm:p-10">
              <Tabs
                name="ds"
                listClassName="mb-5"
                items={[
                  {
                    id: 'a',
                    label: (
                      <>
                        <Mail className="size-4" strokeWidth={1.5} /> Email
                      </>
                    ),
                    panel: (
                      <p className="t-body">
                        Sent from the rep&apos;s own Gmail, with our Message-ID and
                        List-Unsubscribe.
                      </p>
                    ),
                  },
                  {
                    id: 'b',
                    label: (
                      <>
                        <PhoneCall className="size-4" strokeWidth={1.5} /> Calls
                      </>
                    ),
                    panel: (
                      <p className="t-body">
                        A task in the rep&apos;s dialer; the outcome they log picks the next branch.
                      </p>
                    ),
                  },
                  {
                    id: 'c',
                    label: (
                      <>
                        <Webhook className="size-4" strokeWidth={1.5} /> Webhooks
                      </>
                    ),
                    panel: (
                      <p className="t-body">Signed, retried, ordered per enrollment, replayable.</p>
                    ),
                  },
                ]}
              />
              <div className="mt-8 border border-border">
                <Accordion
                  name="ds-faq"
                  items={[
                    {
                      q: 'Does it send email itself?',
                      a: "Yes, through the Gmail API with each sender's consent.",
                    },
                    { q: 'Is there a UI?', a: 'No. Your CRM is the UI.' },
                  ]}
                />
              </div>
            </div>
          </Cells>
        </Section>

        <Band />

        <Section>
          <SectionHeading
            title="Grid"
            lede="A 1120px column with rails from 1152px up. Cells use the grid gap as the hairline, so borders never double. Sections are separated by 64px bands that carry only the rules."
          />
          <Cells className="grid-cols-2 md:grid-cols-4">
            {['1 / 4', '2 / 4', '3 / 4', '4 / 4'].map((c) => (
              <div
                key={c}
                className="grid h-24 place-items-center font-mono text-[12px] text-subtle-foreground"
              >
                {c}
              </div>
            ))}
            <div className="col-span-2 grid h-24 place-items-center font-mono text-[12px] text-subtle-foreground">
              span 2
            </div>
            <div className="col-span-2 grid h-24 place-items-center font-mono text-[12px] text-subtle-foreground">
              span 2
            </div>
          </Cells>
        </Section>
      </main>
    </>
  );
}
