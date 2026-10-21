import { ArrowRight } from 'lucide-react';
import { CodeWindow } from '@/components/ds/code-card';
import { Section, SectionHeading } from '@/components/ds/frame';
import { Tabs } from '@/components/ds/tabs';
import { useCases } from '@/lib/content';
import { icons } from '@/lib/icons';
import { DOCS, links } from '@/lib/links';

/**
 * The use-case switcher, in the shape of a code section: the cases as a list on the left,
 * a dark code window on the right inside a hairline frame, and what the code does under it.
 */
export function UseCases() {
  return (
    <Section id="use-cases" labelledBy="use-cases-title" inner="py-20 sm:py-28">
      <SectionHeading
        id="use-cases-title"
        n="01"
        label="Use cases"
        title="Every use case, in one TypeScript file"
      />
      <Tabs
        name="uc"
        variant="side"
        className="mt-12 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start lg:gap-0"
        listClassName="lg:mt-5"
        items={useCases.map((u) => {
          const Icon = icons[u.icon]!;
          return {
            id: u.id,
            label: (
              <>
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-surface lg:size-9">
                  <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                </span>
                {u.label}
              </>
            ),
            panel: (
              <div className="rounded-[24px] border border-border p-3 sm:p-4">
                <CodeWindow
                  tag={u.file}
                  meta={u.meta}
                  code={u.code}
                  lang={u.lang}
                  className="lg:min-h-[560px]"
                />
                <div className="mt-3 grid gap-3 sm:mt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
                  <p className="rounded-2xl bg-surface px-5 py-4 font-mono text-[14px] leading-[1.5] text-foreground">
                    {u.claim}
                    {u.lang === 'typescript' && (
                      <>
                        {' '}
                        <span className="text-foreground/60">
                          Install it with{' '}
                          <a href={links.npm} className="underline underline-offset-2 hover:text-foreground">
                            npm install @opensequence/sdk
                          </a>
                          .
                        </span>
                      </>
                    )}
                  </p>
                  <a
                    href={`${DOCS}${u.href}`}
                    className="inline-flex items-center justify-between gap-6 rounded-2xl bg-surface px-5 py-4 font-mono text-[14px] text-foreground transition-colors hover:bg-peri"
                  >
                    Read the guide <ArrowRight className="size-4" />
                  </a>
                </div>
              </div>
            ),
          };
        })}
      />
    </Section>
  );
}
