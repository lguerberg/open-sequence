import { cn } from '@/lib/utils';
import { Label } from './marks';

const tones = {
  ground: 'bg-background',
  peri: 'bg-peri',
  sky: 'bg-sky',
  ink: 'bg-foreground text-surface',
} as const;

/** A full-width band with the 1216px column inside. Bands meet on a hairline. */
export function Section({
  id,
  className,
  children,
  labelledBy,
  tone = 'ground',
  rule = true,
  inner,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
  labelledBy?: string;
  tone?: keyof typeof tones;
  rule?: boolean;
  inner?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn('scroll-mt-6', tones[tone], rule && 'border-t border-border', className)}
    >
      <div className={cn('wrap', inner)}>{children}</div>
    </section>
  );
}

/** The section opener: a mono label, a light headline, an optional lede and action. Left aligned. */
export function SectionHeading({
  id,
  n,
  label,
  title,
  lede,
  action,
  className,
}: {
  id?: string;
  n?: string;
  label?: React.ReactNode;
  title: React.ReactNode;
  lede?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col gap-6 md:flex-row md:items-end md:justify-between', className)}
    >
      <div className="max-w-3xl">
        {label ? <Label n={n}>{label}</Label> : null}
        <h2 id={id} className={cn('t-h2', label && 'mt-7')}>
          {title}
        </h2>
        {lede ? <p className="t-lead mt-4 max-w-2xl">{lede}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** A rounded card on the ground. */
export function Card({
  className,
  children,
  as: As = 'div',
}: {
  className?: string;
  children: React.ReactNode;
  as?: 'div' | 'article' | 'li';
}) {
  return <As className={cn('rounded-[24px] bg-surface p-4', className)}>{children}</As>;
}
