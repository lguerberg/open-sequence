import { ArrowRight } from 'lucide-react';
import { Section, SectionHeading } from '@/components/ds/frame';
import { Label } from '@/components/ds/marks';
import { compareGuides, comparison, comparisonColumns, comparisonExamples } from '@/lib/content';
import { cn } from '@/lib/utils';

/**
 * Where OpenSequence sits next to the four things people compare it with, as a real table (so search
 * engines and screen readers read rows and headers), then the guides that go deeper on each one.
 * The table scrolls inside its own frame on narrow screens; the page never scrolls sideways.
 */
export function Compare() {
  return (
    <Section id="compare" labelledBy="compare-title" inner="py-20 sm:py-28">
      <SectionHeading
        id="compare-title"
        n="05"
        label="Compare"
        title="How OpenSequence compares"
        lede="It is the sequencing engine on its own: no contact database, no inbox warm-up, no UI. Here is what that means next to the tools teams usually reach for."
      />
      <div className="mt-12 overflow-x-auto rounded-[24px] border border-border">
        <table className="w-full min-w-[860px] border-collapse text-left">
          <caption className="sr-only">
            OpenSequence compared with seat-based sequencers, lifecycle email platforms, workflow
            automation tools and building a sequencer yourself.
          </caption>
          <thead>
            <tr className="border-b border-border">
              <td className="w-[22%] p-4" />
              {comparisonColumns.map((c, i) => (
                <th
                  key={c}
                  scope="col"
                  className={cn('p-4 align-bottom', i === 0 && 'bg-brand-soft')}
                >
                  <span className="block text-[15px] font-semibold tracking-[-0.02em]">{c}</span>
                  {comparisonExamples[i] ? (
                    <span className="mt-1 block font-mono text-[11.5px] font-normal text-muted-foreground">
                      {comparisonExamples[i]}
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparison.map((row) => (
              <tr key={row.label} className="border-b border-border last:border-b-0">
                <th scope="row" className="p-4 text-[14px] font-medium tracking-[-0.01em]">
                  {row.label}
                </th>
                {row.cells.map((cell, i) => (
                  <td
                    key={i}
                    className={cn(
                      'p-4 font-mono text-[13px] leading-[1.4]',
                      i === 0 ? 'bg-brand-soft text-foreground' : 'text-ink-2'
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-12">
        <Label>Go deeper</Label>
        <ul className="m-0 mt-6 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {compareGuides.map((g) => (
            <li key={g.href}>
              <a
                href={g.href}
                className="flex items-center justify-between gap-6 rounded-2xl bg-surface px-5 py-4 font-mono text-[14px] text-foreground transition-colors hover:bg-peri"
              >
                {g.label} <ArrowRight className="size-4 shrink-0" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
