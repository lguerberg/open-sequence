import type { Metadata } from 'next';
import { Cta } from '@/components/site/cta';
import { Faq } from '@/components/site/faq';
import { SiteFooter } from '@/components/site/footer';
import { HardParts } from '@/components/site/hard-parts';
import { SiteHeader } from '@/components/site/header';
import { Hero } from '@/components/site/hero';
import { JsonLd } from '@/components/site/json-ld';
import { UseCases } from '@/components/site/use-cases';
import { ValueProps } from '@/components/site/value-props';

/** Only the home page points its canonical at `/`: the layout's metadata is inherited by the 404 and design pages too. */
export const metadata: Metadata = { alternates: { canonical: '/' } };

export default function Page() {
  return (
    <>
      <JsonLd />
      <SiteHeader />
      <main>
        <Hero />
        <UseCases />
        <ValueProps />
        <HardParts />
        <Faq />
        <Cta />
      </main>
      <SiteFooter />
    </>
  );
}
