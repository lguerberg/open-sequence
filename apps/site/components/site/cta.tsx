import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CopyCommand } from '@/components/ds/controls';
import { Section } from '@/components/ds/frame';
import { links } from '@/lib/links';

export function Cta() {
  return (
    <Section labelledBy="cta">
      <div className="px-6 py-20 text-center sm:px-10 sm:py-24">
        <h2 id="cta" className="t-display mx-auto max-w-3xl">
          Stop paying per seat to send sequences.
        </h2>
        <p className="t-lead mx-auto mt-5 max-w-xl">
          Start the image, create a project and follow the six calls in the quickstart. Mock
          providers are on in development, so nothing leaves your machine until you connect a real
          account.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <a href={links.quickstart}>
              Start building <ArrowRight className="size-4" />
            </a>
          </Button>
          <CopyCommand command="docker compose up" className="h-12" />
        </div>
      </div>
    </Section>
  );
}
