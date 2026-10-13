import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ds/code-card';
import { Tabs } from '@/components/ds/tabs';
import { useCases } from '@/lib/content';
import { icons } from '@/lib/icons';
import { DOCS } from '@/lib/links';

/**
 * The use-case switcher under the hero, in the manner of trigger.dev. The tiles sit in the same
 * framed column as the panel they drive: one short snippet on the left, what it does on the right.
 */
export function UseCases() {
  return (
    <section
      id="use-cases"
      aria-labelledby="use-cases-title"
      className="scroll-mt-20 border-b border-border"
    >
      <h2 id="use-cases-title" className="sr-only">
        Use cases
      </h2>
      <div className="frame">
        <Tabs
          name="uc"
          variant="tiles"
          listClassName="justify-start border-b border-border px-4 py-3 sm:px-5 lg:justify-center-safe"
          items={useCases.map((u) => {
            const Icon = icons[u.icon]!;
            return {
              id: u.id,
              label: (
                <>
                  <Icon className="size-4" strokeWidth={1.5} aria-hidden="true" /> {u.label}
                </>
              ),
              panel: (
                <div className="grid lg:min-h-[600px] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <div className="flex min-w-0 flex-col border-b border-border bg-code lg:border-r lg:border-b-0">
                    <div className="flex items-center justify-between gap-4 border-b border-border bg-surface px-5 py-2.5 font-mono text-[13px]">
                      <span className="truncate">{u.file}</span>
                      <span className="shrink-0 text-[12px] text-subtle-foreground">{u.meta}</span>
                    </div>
                    <div className="flex flex-1 items-start py-5 [&_.shiki_code]:leading-[1.62]">
                      <Code code={u.code} lang={u.lang} className="w-full min-w-0" />
                    </div>
                  </div>
                  <div className="flex flex-col justify-center gap-6 px-6 py-9 sm:px-9">
                    <p className="text-[22px] leading-[1.3] tracking-[-0.02em] text-foreground sm:text-[24px]">
                      {u.claim}
                    </p>
                    <Button asChild variant="link" size="inline" className="self-start">
                      <a href={`${DOCS}${u.href}`}>
                        Learn more <ArrowRight className="size-3" />
                      </a>
                    </Button>
                  </div>
                </div>
              ),
            };
          })}
        />
      </div>
    </section>
  );
}
