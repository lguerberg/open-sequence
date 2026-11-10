import { Button } from '@/components/ui/button';
import { CopyCommand } from '@/components/ds/controls';
import { links } from '@/lib/links';
import { HeroCanvas } from './hero-canvas';

/** The hero: the headline, the sequence builder under it, then the dotted celeste band with the calls to action. */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="wrap pb-16 sm:pb-24">
      <div className="pt-4 pb-12 sm:pt-10 sm:pb-16 lg:pt-14 lg:pb-20">
        <h1 id="hero-title" className="t-display">
          Open source sequences, <span className="text-brand">as&nbsp;code.</span>
        </h1>
        <p className="t-sub mt-6 max-w-[38rem] sm:mt-8">
          OpenSequence is the self-hosted engine behind multi-step outreach. Your product enrolls a
          contact; it sends the emails, texts, call tasks and LinkedIn steps from a real person, and
          stops when they reply.
        </p>
        <div className="mt-12 sm:mt-16">
          <HeroCanvas />
        </div>
      </div>

      <div className="dots relative overflow-hidden rounded-[28px] bg-band px-6 py-8 text-foreground sm:px-12 sm:py-11">
        <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-[44rem]">
            <p className="text-[clamp(24px,2.5vw,34px)] leading-[1.1] font-semibold tracking-[-0.035em]">
              One engine for sales, recruiting, onboarding and renewals. No per-seat bill.
            </p>
            <p className="mt-4 max-w-[38rem] font-mono text-[12.5px] leading-[1.55] text-foreground/75">
              Seat-based sequencers list at $79 to $175 per user each month; for 15 people that is
              $14,200 to $31,500 a year. OpenSequence is Apache-2.0 and runs on one container and a
              Postgres, for 5 senders or 500.
            </p>
          </div>
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
            <p className="text-[clamp(24px,2.5vw,34px)] leading-none font-semibold tracking-[-0.035em]">
              Build with agents
            </p>
            <span className="flex gap-2 font-mono text-[12px]">
              <span className="rounded-full bg-white/55 px-2.5 py-1">MCP</span>
              <span className="rounded-full bg-white/55 px-2.5 py-1">llms.txt</span>
            </span>
          </div>
          <CopyCommand
            tone="band"
            command="Add sequences to my app: docs.opensequence.dev/llms.txt"
          />
        </div>
      </div>
    </section>
  );
}
