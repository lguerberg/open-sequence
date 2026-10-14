import { Button } from '@/components/ui/button';
import { CopyCommand } from '@/components/ds/controls';
import { links } from '@/lib/links';
import { HeroCanvas } from './hero-canvas';

/** The hero: the sequence builder and the headline, then the dotted celeste band with the calls to action. */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="wrap pb-16 sm:pb-24">
      <div className="grid items-center gap-12 pt-4 pb-12 sm:pt-10 sm:pb-16 xl:grid-cols-[minmax(0,13fr)_minmax(0,11fr)] xl:gap-14 lg:pt-14 lg:pb-20">
        <div className="order-2 mx-auto w-full max-w-[900px] xl:order-1 xl:max-w-none">
          <HeroCanvas />
        </div>
        <div className="order-1 xl:order-2">
          <h1 id="hero-title" className="t-display xl:text-[clamp(56px,5.9vw,92px)]">
            Sales sequences, <em className="text-brand">as&nbsp;code.</em>
          </h1>
          <p className="t-sub mt-6 max-w-[34rem] sm:mt-8">
            Own your sales sequencing infrastructure without building it from scratch.
          </p>
        </div>
      </div>

      <div className="dots relative overflow-hidden rounded-[28px] bg-band px-6 py-8 text-foreground sm:px-12 sm:py-11">
        <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
          <p className="max-w-[40rem] font-display text-[clamp(28px,2.9vw,40px)] leading-[1.02] tracking-[-0.01em]">
            No per-seat pricing. No black boxes. Just infrastructure you control.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="dark" size="lg">
              <a href={links.quickstart}>Start building</a>
            </Button>
            <Button asChild variant="light" size="lg">
              <a href={links.docs}>Read the docs</a>
            </Button>
          </div>
        </div>
        <div className="my-8 h-px bg-foreground/15 sm:my-9" />
        <div className="grid items-center gap-5 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-10">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <p className="font-display text-[clamp(28px,2.9vw,40px)] leading-none tracking-[-0.01em]">
              Build with agents
            </p>
            <span className="flex gap-2 font-mono text-[12px]">
              <span className="rounded-full bg-white/55 px-2.5 py-1">MCP</span>
              <span className="rounded-full bg-white/55 px-2.5 py-1">llms.txt</span>
            </span>
          </div>
          <CopyCommand
            tone="band"
            command="Add sales sequences to my app: docs.opensequence.dev/llms.txt"
          />
        </div>
      </div>
    </section>
  );
}
