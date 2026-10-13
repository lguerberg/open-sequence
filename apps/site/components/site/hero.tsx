import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CopyCommand } from '@/components/ds/controls';
import { Section } from '@/components/ds/frame';
import { Chip } from '@/components/ds/marks';
import { links } from '@/lib/links';
import { UseCases } from './use-cases';

/** The hero, in the manner of trigger.dev: short centered copy, then the use-case switcher in the first screen. */
export function Hero() {
  return (
    <>
      <Section labelledBy="hero-title">
        <div className="mx-auto max-w-3xl px-6 pt-16 pb-12 text-center sm:px-10 sm:pt-20 sm:pb-14">
          <a href={links.github} className="inline-flex items-center gap-2 rounded-full border border-border py-1 pr-3 pl-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            <Chip className="py-0.5">Open source</Chip>
            Apache-2.0 · self-hosted
          </a>
          <h1 id="hero-title" className="t-display mt-6">
            Sales sequences, as&nbsp;code.
          </h1>
          <p className="mx-auto mt-5 max-w-[38rem] text-[16px] leading-[1.6] text-muted-foreground sm:text-[17px]">
            Build your own sales sequencing infrastructure without building it from scratch.
          </p>
          <p className="mt-3 text-[15px] text-foreground">No per-seat pricing. No black boxes. Just infrastructure you control.</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild>
              <a href={links.quickstart}>
                Start building <ArrowRight className="size-3.5" />
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={links.docs}>Read the docs</a>
            </Button>
            <CopyCommand command="docker compose up" />
          </div>
        </div>
      </Section>
      <UseCases />
    </>
  );
}
