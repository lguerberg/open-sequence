import { Cells, Section, SectionHeading } from '@/components/ds/frame';
import { IconTile, Label } from '@/components/ds/marks';
import { valueProps } from '@/lib/content';
import { icons } from '@/lib/icons';

export function ValueProps() {
  return (
    <Section id="value" labelledBy="value-title">
      <SectionHeading id="value-title" title="Why teams own their sequencing" lede="The price is the obvious part. These are the reasons teams stay." />
      <Cells className="sm:grid-cols-2 lg:grid-cols-4">
        {valueProps.map((v) => (
          <div key={v.label} className="flex flex-col gap-4 p-6 sm:p-8">
            <IconTile icon={icons[v.icon]!} />
            <Label as="h3">{v.label}</Label>
            <p className="t-body -mt-1">{v.text}</p>
          </div>
        ))}
      </Cells>
    </Section>
  );
}
