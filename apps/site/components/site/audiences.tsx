import { ArrowRight } from 'lucide-react';
import { Card, Section, SectionHeading } from '@/components/ds/frame';
import { IconTile } from '@/components/ds/marks';
import { audiences } from '@/lib/content';
import { icons } from '@/lib/icons';

/**
 * Who runs sequences on the engine: one card per team, each with the steps its sequences usually
 * chain, written as mono chips so the card reads like a definition, not a slogan.
 */
export function Audiences() {
  return (
    <Section id="use-cases" labelledBy="use-cases-title" inner="py-20 sm:py-28">
      <SectionHeading
        id="use-cases-title"
        n="01"
        label="Use cases"
        title="Every sequence your product sends, on one engine"
        lede="Whoever writes to people one at a time, over days, across channels, runs the same loop: send, wait, follow up, hand a task to a human, stop on a reply. OpenSequence runs that loop for any team."
      />
      <ul className="m-0 mt-12 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        {audiences.map((a) => (
          <Card as="li" key={a.label} className="flex flex-col p-6">
            <IconTile icon={icons[a.icon]!} />
            <h3 className="t-h3 mt-8">{a.label}</h3>
            <p className="t-body mt-3 text-ink-2">{a.text}</p>
            <ul
              aria-label={`A typical ${a.label.toLowerCase()} sequence`}
              className="m-0 mt-auto flex list-none flex-wrap gap-1.5 p-0 pt-6"
            >
              {a.steps.map((step) => (
                <li
                  key={step}
                  className="rounded-full bg-surface-2 px-2.5 py-1 font-mono text-[11.5px] text-ink-2"
                >
                  {step}
                </li>
              ))}
            </ul>
            {a.guide ? (
              <a
                href={a.guide}
                className="mt-5 inline-flex items-center gap-2 self-start font-mono text-[13px] text-foreground underline decoration-1 underline-offset-4 transition-colors hover:text-brand"
              >
                Read the guide<span className="sr-only">: {a.label}</span>
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </Card>
        ))}
      </ul>
    </Section>
  );
}
