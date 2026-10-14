import { Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section, SectionHeading } from '@/components/ds/frame';
import { IconTile, Label, Mark } from '@/components/ds/marks';
import { buildTimeline, hardParts } from '@/lib/content';
import { icons } from '@/lib/icons';
import { links } from '@/lib/links';
import { cn } from '@/lib/utils';

/**
 * The argument against building it yourself, in three bands: the claim; a tinted band with what
 * usually happens; then one card per hard part. The front of a card is the problem; hover, focus or
 * tap flips it to how OpenSequence handles it. Pure CSS: works without JavaScript and with keyboard.
 */
export function HardParts() {
  return (
    <>
      <Section id="hard-parts" labelledBy="hard-parts-title" inner="py-16 sm:py-20">
        <SectionHeading
          id="hard-parts-title"
          title={
            <>
              You can vibe-code a sequence.{' '}
              <span className="text-muted-foreground">Not a sequencing service.</span>
            </>
          }
          lede="The first version takes a weekend. The next two years go to edge cases, and you find each one in production."
        />
      </Section>

      <section
        aria-label="If you build it yourself"
        className="relative border-t border-border bg-peri"
      >
        <div className="wrap pt-16 pb-24 sm:pt-20 sm:pb-28">
          <Label>If you build it yourself</Label>
          <ol className="m-0 mt-10 grid list-none gap-10 p-0 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {buildTimeline.map((t, i) => (
              <li key={t.when} className="flex gap-4">
                <Mark className={cn('mt-2', i === buildTimeline.length - 1 && 'bg-bad')} />
                <div>
                  <h3 className="t-h3">{t.when}</h3>
                  <p className="t-body mt-3 max-w-[17rem]">{t.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <a
          href={links.architecture}
          className="absolute right-0 bottom-0 hidden rounded-tl-[24px] bg-background py-4 pr-8 pl-8 font-mono text-[15px] text-foreground sm:block lg:pr-[max(32px,calc((100vw-1216px)/2))]"
        >
          See how it is built in the{' '}
          <span className="link-corner underline decoration-1 underline-offset-[5px]">
            architecture document
          </span>
        </a>
      </section>

      <Section labelledBy="problems-title" inner="py-20 sm:py-28">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Label n="03">Nine problems</Label>
            <h2 id="problems-title" className="t-h2 mt-7">
              What you would have to solve
            </h2>
          </div>
          <span className="inline-flex items-center gap-2 font-mono text-[13px] text-muted-foreground">
            <RefreshCw className="size-3.5" strokeWidth={1.75} aria-hidden="true" /> Hover or tap a
            card to see how OpenSequence solves it
          </span>
        </div>
        <ul className="m-0 mt-12 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {hardParts.map((h) => (
            <li
              key={h.label}
              tabIndex={0}
              className="flip h-[268px] cursor-pointer"
              aria-label={`${h.label}. ${h.problem} How OpenSequence handles it: ${h.handled}`}
            >
              <div className="flip-inner">
                <div
                  className="flip-face flip-front flex flex-col gap-5 bg-surface p-6"
                  aria-hidden="true"
                >
                  <div className="flex items-center gap-4">
                    <IconTile icon={icons[h.icon]!} />
                    <h3 className="t-h3">{h.label}</h3>
                  </div>
                  <p className="t-body">{h.problem}</p>
                  <span className="mt-auto inline-flex items-center gap-2 font-mono text-[12px] tracking-[0.08em] text-muted-foreground uppercase">
                    <RefreshCw className="size-3.5" strokeWidth={1.75} /> How we solve it
                  </span>
                </div>
                <div
                  className="flip-face flip-back dots flex flex-col gap-5 bg-band p-6 text-foreground"
                  aria-hidden="true"
                >
                  <span className="t-label inline-flex items-center gap-2.5 text-foreground">
                    <span className="grid size-[18px] place-items-center rounded-full bg-foreground text-band">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    Handled by OpenSequence
                  </span>
                  <p className="font-mono text-[15px] leading-[1.35]">{h.handled}</p>
                  <code className="mt-auto self-start rounded-full bg-white/60 px-3 py-1 font-mono text-[12px] text-foreground">
                    {h.evidence}
                  </code>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-10 sm:hidden">
          <Button asChild variant="link" size="inline">
            <a href={links.architecture}>Read the architecture document</a>
          </Button>
        </div>
      </Section>
    </>
  );
}
