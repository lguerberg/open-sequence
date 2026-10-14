import { Button } from '@/components/ui/button';
import { CopyCommand } from '@/components/ds/controls';
import { Label } from '@/components/ds/marks';
import { links } from '@/lib/links';

/** The closing band: light celeste, the call to action, and the wordmark in serif, cropped at the bottom. */
export function Cta() {
  return (
    <section aria-labelledby="cta-title" className="dots overflow-hidden bg-sky">
      <div className="wrap pt-16 sm:pt-20">
        <Label n="05">Get started</Label>
        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
          <div>
            <h2
              id="cta-title"
              className="font-display text-[clamp(40px,5vw,68px)] leading-[0.98] tracking-[-0.02em]"
            >
              Stop paying per seat to send sequences.
            </h2>
            <p className="t-body mt-6 max-w-[34rem]">
              Start the image, create a project and follow the six calls in the quickstart. Mock
              providers are on in development, so nothing leaves your machine until you connect a
              real account.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <CopyCommand tone="band" command="docker compose up" />
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="dark" size="lg">
                <a href={links.quickstart}>Start building</a>
              </Button>
              <Button asChild variant="light" size="lg">
                <a href={links.docs}>Read the docs</a>
              </Button>
            </div>
          </div>
        </div>
      </div>
      <p
        aria-hidden="true"
        className="mt-12 -mb-[0.2em] px-3 font-display text-[clamp(72px,17vw,250px)] leading-[0.8] tracking-[-0.03em] whitespace-nowrap text-foreground italic select-none sm:mt-16 lg:px-6"
      >
        opensequence
      </p>
    </section>
  );
}
