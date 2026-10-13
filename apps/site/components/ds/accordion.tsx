import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/** An accordion on native <details>: one open at a time through the shared `name`. */
export function Accordion({ name, items, className }: { name: string; items: Array<{ q: string; a: React.ReactNode }>; className?: string }) {
  return (
    <div className={cn('faq', className)}>
      {items.map((it, i) => (
        <details key={it.q} name={name} open={i === 0} className="group border-b border-border last:border-b-0">
          <summary className="flex items-start justify-between gap-6 px-6 py-5 text-[16px] text-foreground transition-colors hover:bg-surface-2 sm:px-8">
            <span>{it.q}</span>
            <Plus className="faq-plus mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform" aria-hidden="true" />
          </summary>
          <div className="t-body px-6 pb-6 sm:px-8">{it.a}</div>
        </details>
      ))}
    </div>
  );
}
