import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The uppercase mono label that names a cell. */
export function Label({ className, children, as: As = 'p' }: { className?: string; children: React.ReactNode; as?: 'p' | 'span' | 'h3' | 'dt' }) {
  return <As className={cn('t-label text-foreground', className)}>{children}</As>;
}

/** A small pill: "STEP 01", "v0.1", a filter. */
export function Chip({ className, children, tone = 'neutral' }: { className?: string; children: React.ReactNode; tone?: 'neutral' | 'brand' }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-medium tracking-[0.04em] uppercase', tone === 'brand' ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-foreground', className)}>
      {children}
    </span>
  );
}

/** A square tile holding one icon, drawn on the hairline. */
export function IconTile({ icon: Icon, size = 'md', className }: { icon: LucideIcon; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const box = size === 'sm' ? 'size-7' : size === 'lg' ? 'size-14' : 'size-10';
  const glyph = size === 'sm' ? 'size-3.5' : size === 'lg' ? 'size-6' : 'size-[18px]';
  return (
    <span className={cn('grid shrink-0 place-items-center border border-border bg-surface text-foreground', box, className)} aria-hidden="true">
      <Icon className={glyph} strokeWidth={1.5} />
    </span>
  );
}

/** A state dot. Brand is reserved for "sent", "live" and "selected". */
export function Dot({ tone = 'muted', pulse = false, className }: { tone?: 'muted' | 'brand' | 'ok' | 'ink'; pulse?: boolean; className?: string }) {
  const color = tone === 'brand' ? 'bg-brand' : tone === 'ok' ? 'bg-ok' : tone === 'ink' ? 'bg-foreground' : 'bg-subtle-foreground';
  return <span className={cn('inline-block size-1.5 shrink-0 rounded-full', color, pulse && 'animate-pulse', className)} aria-hidden="true" />;
}
