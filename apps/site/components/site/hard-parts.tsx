import { ArrowRight, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Cells, Section } from '@/components/ds/frame';
import { IconTile, Label } from '@/components/ds/marks';
import { buildTimeline, hardParts } from '@/lib/content';
import { icons } from '@/lib/icons';
import { links } from '@/lib/links';
import { cn } from '@/lib/utils';

/**
 * The argument against building it yourself: the claim, a timeline of what usually happens, then
 * one card per hard part. The front is the problem; hover, focus or tap flips it to how
 * OpenSequence handles it. Pure CSS: works without JavaScript and with keyboard.
 */
export function HardParts() {
  return (
    <Section id="hard-parts" labelledBy="hard-parts-title">
      <div className="flex flex-col gap-8 border-b border-border px-6 py-14 sm:px-10 sm:py-16 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <h2 id="hard-parts-title" className="t-h2">
            You can vibe-code a sequence.{' '}
            <span className="text-muted-foreground">Not a sequencing service.</span>
          </h2>
          <p className="t-lead mt-5">
            The first version takes a weekend. The next two years go to edge cases, and you find
            each one in production.
          </p>
        </div>
        <Button asChild variant="outline" className="shrink-0 self-start lg:self-end">
          <a href={links.architecture}>
            Read how it is built <ArrowRight className="size-3.5" />
          </a>
        </Button>
      </div>

      <div className="border-b border-border px-6 py-10 sm:px-10">
        <Label className="text-muted-foreground">If you build it yourself</Label>
        {/* Phones: a swipeable row that bleeds to the edges, the next stop peeking in. Wider: a grid. */}
        <ol className="no-scrollbar relative -mx-6 mt-8 mb-0 flex list-none snap-x snap-mandatory scroll-px-6 gap-6 overflow-x-auto px-6 py-0 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-8 sm:overflow-visible sm:px-0 lg:grid-cols-4 lg:gap-6">
          <span
            aria-hidden="true"
            className="absolute top-[5px] right-0 left-0 hidden h-px bg-border lg:block"
          />
          {buildTimeline.map((t, i) => (
            <li key={t.when} className="relative w-[78%] shrink-0 snap-start sm:w-auto">
              {i < buildTimeline.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute top-[5px] -right-6 left-0 h-px bg-border sm:hidden"
                />
              )}
              <span
                aria-hidden="true"
                className={cn(
                  'relative block size-[11px] rounded-full border-2 border-background',
                  i === 0
                    ? 'bg-ok'
                    : i === buildTimeline.length - 1
                      ? 'bg-warn'
                      : 'bg-subtle-foreground'
                )}
              />
              <Label as="span" className="mt-4 block">
                {t.when}
              </Label>
              <p className="t-body mt-2 max-w-[17rem]">{t.text}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4 sm:px-10">
        <Label className="text-muted-foreground">Nine problems you would have to solve</Label>
        <span className="inline-flex items-center gap-2 text-[13px] text-subtle-foreground">
          <RefreshCw className="size-3.5" strokeWidth={1.5} aria-hidden="true" /> Hover or tap a
          card to see how OpenSequence solves it
        </span>
      </div>
      <Cells className="sm:grid-cols-2 lg:grid-cols-3">
        {hardParts.map((h) => (
          <div
            key={h.label}
            tabIndex={0}
            className="flip h-[268px] cursor-pointer"
            aria-label={`${h.label}. ${h.problem} How OpenSequence handles it: ${h.handled}`}
          >
            <div className="flip-inner">
              <div
                className="flip-face flip-front flex flex-col gap-4 bg-background p-6 sm:p-8"
                aria-hidden="true"
              >
                <div className="flex items-center gap-3.5">
                  <IconTile icon={icons[h.icon]!} />
                  <Label as="h3">{h.label}</Label>
                </div>
                <p className="t-body">{h.problem}</p>
                <span className="mt-auto inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.06em] text-subtle-foreground uppercase">
                  <RefreshCw className="size-3" strokeWidth={1.75} /> How we solve it
                </span>
              </div>
              <div
                className="flip-face flip-back flex flex-col gap-4 bg-surface p-6 sm:p-8"
                aria-hidden="true"
              >
                <div className="flex items-center gap-2.5">
                  <Check className="size-4 text-brand" strokeWidth={2.25} />
                  <Label as="span" className="text-brand">
                    Handled by OpenSequence
                  </Label>
                </div>
                <p className="text-[15px] leading-relaxed text-foreground">{h.handled}</p>
                <code className="mt-auto self-start rounded-sm border border-border bg-code px-2.5 py-1 font-mono text-[12px] text-muted-foreground">
                  {h.evidence}
                </code>
              </div>
            </div>
          </div>
        ))}
      </Cells>
    </Section>
  );
}
