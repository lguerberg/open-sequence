import { Card, Section, SectionHeading } from '@/components/ds/frame';
import { IconTile } from '@/components/ds/marks';
import { valueProps } from '@/lib/content';
import { icons } from '@/lib/icons';

/** Why own it: a grid of rounded cards, one per reason. */
export function ValueProps() {
  return (
    <Section id="value" labelledBy="value-title" inner="py-20 sm:py-28">
      <SectionHeading
        id="value-title"
        n="02"
        label="Why own it"
        title="Why teams own their sequencing"
        lede="Price is the obvious reason. Here are the others."
      />
      <ul className="m-0 mt-12 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        {valueProps.map((v) => (
          <Card as="li" key={v.label} className="flex flex-col p-6">
            <IconTile icon={icons[v.icon]!} />
            <h3 className="t-h3 mt-8">{v.label}</h3>
            <p className="t-body mt-3 text-ink-2">{v.text}</p>
          </Card>
        ))}
      </ul>
    </Section>
  );
}
