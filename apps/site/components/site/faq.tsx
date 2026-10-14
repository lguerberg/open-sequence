import { Accordion } from '@/components/ds/accordion';
import { Section } from '@/components/ds/frame';
import { Label } from '@/components/ds/marks';
import { faq } from '@/lib/content';

export function Faq() {
  return (
    <Section id="faq" labelledBy="faq-title" inner="py-20 sm:py-28">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
        <div>
          <Label n="04">FAQ</Label>
          <h2 id="faq-title" className="t-h2 mt-7">
            Questions
          </h2>
          <p className="t-lead mt-4">What people ask before the quickstart.</p>
        </div>
        <div className="rounded-[24px] bg-surface px-5 py-2 sm:px-8">
          <Accordion name="faq" items={faq} />
        </div>
      </div>
    </Section>
  );
}
