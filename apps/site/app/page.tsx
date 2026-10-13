import { Band } from '@/components/ds/frame';
import { Cta } from '@/components/site/cta';
import { Faq } from '@/components/site/faq';
import { SiteFooter } from '@/components/site/footer';
import { HardParts } from '@/components/site/hard-parts';
import { SiteHeader } from '@/components/site/header';
import { Hero } from '@/components/site/hero';
import { JsonLd } from '@/components/site/json-ld';
import { Agents } from '@/components/site/agents';
import { ValueProps } from '@/components/site/value-props';

export default function Page() {
  return (
    <>
      <JsonLd />
      <SiteHeader />
      <main id="top">
        <Hero />
        <Band />
        <ValueProps />
        <Band />
        <HardParts />
        <Band />
        <Agents />
        <Band />
        <Faq />
        <Band />
        <Cta />
      </main>
      <Band />
      <SiteFooter />
    </>
  );
}
