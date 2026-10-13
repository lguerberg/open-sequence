import { Accordion } from '@/components/ds/accordion';
import { Cells, Section } from '@/components/ds/frame';
import { faq } from '@/lib/content';

export function Faq() {
  return (
    <Section id="faq" labelledBy="faq-title">
      <Cells className="lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="p-6 sm:p-10 lg:p-12">
          <h2 id="faq-title" className="t-h2">
            Questions
          </h2>
          <p className="t-lead mt-4">What people ask before the quickstart.</p>
        </div>
        <Accordion name="faq" items={faq} />
      </Cells>
    </Section>
  );
}
