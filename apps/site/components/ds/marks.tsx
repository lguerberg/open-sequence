import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The bullet: a small celeste dot. Marks a list item. */
export function Mark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-2.5 shrink-0 rounded-full bg-band', className)}
    />
  );
}

/**
 * The uppercase mono label. With `n`, it is numbered like a step of a sequence: "01 ─── USE CASES".
 * Without, it leads with the dot.
 */
export function Label({
  className,
  children,
  as: As = 'p',
  n,
}: {
  className?: string;
  children: React.ReactNode;
  as?: 'p' | 'span' | 'h3' | 'dt';
  n?: string;
}) {
  return (
    <As className={cn('t-label inline-flex items-center gap-3 text-foreground', className)}>
      {n ? (
        <>
          <span className="text-brand">{n}</span>
          <span aria-hidden="true" className="h-px w-7 bg-faint" />
        </>
      ) : (
        <Mark />
      )}
      {children}
    </As>
  );
}

/** An outlined mono pill with a blue dot: a channel, a region, a client. */
export function Chip({
  className,
  children,
  dot = true,
}: {
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 font-mono text-[12.5px] text-foreground',
        className
      )}
    >
      {dot ? <span aria-hidden="true" className="size-2 rounded-full bg-brand" /> : null}
      {children}
    </span>
  );
}

const badgeTones = {
  sent: 'border-[#9fd884] bg-ok-soft text-ok',
  done: 'border-[#9fd884] bg-ok-soft text-ok',
  wait: 'border-[#ecc76f] bg-warn-soft text-warn',
  retry: 'border-[#ecc76f] bg-warn-soft text-warn',
  reply: 'border-[#a9cff0] bg-brand-soft text-brand',
  exit: 'border-border bg-surface-2 text-muted-foreground',
  failed: 'border-[#ec9a9a] bg-bad-soft text-bad',
} as const;

/** A status badge in a log row: SENT, WAIT, REPLY. */
export function Badge({
  tone,
  children,
  className,
}: {
  tone: keyof typeof badgeTones;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 min-w-14 items-center justify-center rounded-md border px-1.5 font-mono text-[10px] font-semibold tracking-[0.06em] uppercase',
        badgeTones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** An ink disc holding one icon in white: the feature-card glyph. */
export function IconTile({
  icon: Icon,
  size = 'md',
  className,
}: {
  icon: LucideIcon;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const box = size === 'sm' ? 'size-9' : size === 'lg' ? 'size-16' : 'size-12';
  const glyph = size === 'sm' ? 'size-4' : size === 'lg' ? 'size-7' : 'size-[22px]';
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-foreground text-surface',
        box,
        className
      )}
      aria-hidden="true"
    >
      <Icon className={glyph} strokeWidth={1.75} />
    </span>
  );
}

/** A state dot. */
export function Dot({
  tone = 'muted',
  className,
}: {
  tone?: 'muted' | 'brand' | 'ok' | 'sky';
  className?: string;
}) {
  const color =
    tone === 'brand'
      ? 'bg-brand'
      : tone === 'ok'
        ? 'bg-[#5cc02f]'
        : tone === 'sky'
          ? 'bg-sky'
          : 'bg-subtle-foreground';
  return (
    <span
      className={cn('inline-block size-2 shrink-0 rounded-full', color, className)}
      aria-hidden="true"
    />
  );
}
