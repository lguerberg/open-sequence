import { cn } from '@/lib/utils';

/** A section: a full-width rule below, the framed column inside. */
export function Section({ id, className, children, labelledBy }: { id?: string; className?: string; children: React.ReactNode; labelledBy?: string }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className="scroll-mt-20 border-b border-border">
      <div className={cn('frame', className)}>{children}</div>
    </section>
  );
}

/** The empty band between sections: only the rules, no rails. */
export function Band() {
  return <div className="band" aria-hidden="true" />;
}

/** A heading block that sits on its own rule, centered or left. */
export function SectionHeading({ id, title, lede, align = 'center', action, className }: { id?: string; title: React.ReactNode; lede?: React.ReactNode; align?: 'center' | 'left'; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('border-b border-border px-6 py-14 sm:px-10 sm:py-16', align === 'center' ? 'text-center' : 'flex flex-col gap-6 md:flex-row md:items-end md:justify-between', className)}>
      <div className={cn(align === 'center' && 'mx-auto max-w-3xl')}>
        <h2 id={id} className="t-h2">
          {title}
        </h2>
        {lede ? <p className={cn('t-lead mt-4', align === 'center' ? 'mx-auto max-w-2xl' : 'max-w-2xl')}>{lede}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Cells that share their hairlines. Children get the page background. */
export function Cells({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('cells', className)}>{children}</div>;
}
