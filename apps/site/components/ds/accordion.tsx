import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Mark } from './marks';

/** An accordion on native <details>: one open at a time through the shared `name`. */
export function Accordion({
  name,
  items,
  className,
}: {
  name: string;
  items: Array<{ q: string; a: React.ReactNode }>;
  className?: string;
}) {
  return (
    <div className={cn('faq', className)}>
      {items.map((it, i) => (
        <details
          key={it.q}
          name={name}
          open={i === 0}
          className="group border-b border-border last:border-b-0"
        >
          <summary className="flex items-center gap-4 py-5 text-[19px] leading-[1.2] tracking-[-0.02em] text-foreground transition-colors hover:text-brand">
            <Mark />
            <span className="flex-1">{it.q}</span>
            <Plus
              className="faq-caret size-5 shrink-0 text-muted-foreground transition-transform"
              aria-hidden="true"
            />
          </summary>
          <div className="t-body pb-6 pl-[26px] text-ink-2">{it.a}</div>
        </details>
      ))}
    </div>
  );
}
