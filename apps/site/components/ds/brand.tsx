import { cn } from '@/lib/utils';

/**
 * The mark: a sequence in code braces, one step forking on a reply. `tone="light"` is the version for
 * dark grounds (the footer). The braces and the fork are drawn on a 64 by 64 grid.
 */
export function LogoMark({ className, tone = 'ink' }: { className?: string; tone?: 'ink' | 'light' }) {
  const dark = tone === 'light';
  const ink = dark ? '#ffffff' : '#0f1b2a';
  const accent = dark ? '#74acdf' : '#2b7bc0';
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={cn('size-9', className)}>
      {dark ? (
        <rect width="64" height="64" rx="16" fill="#1c2c40" />
      ) : (
        <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="15.5" fill="#ffffff" stroke="#dbe6f1" strokeWidth="1.5" />
      )}
      <g stroke={ink} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 13C14 13 13 16 13 21v6c0 3-2 5-5 5 3 0 5 2 5 5v6c0 5 1 8 6 8" />
        <path d="M45 13c5 0 6 3 6 8v6c0 3 2 5 5 5-3 0-5 2-5 5v6c0 5-1 8-6 8" />
      </g>
      <path d="M22 32h5c5 0 5-7 10-7h4" stroke={ink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M27 32c5 0 5 7 10 7h4" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22" cy="32" r="3.4" fill={ink} />
      <circle cx="41.5" cy="25" r="3.4" fill={ink} />
      <circle cx="41.5" cy="39" r="3.6" fill={accent} />
    </svg>
  );
}

export function Logo({ className, tone = 'ink' }: { className?: string; tone?: 'ink' | 'light' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2.5 text-[22px] font-semibold tracking-[-0.035em]',
        tone === 'ink' ? 'text-foreground' : 'text-surface',
        className
      )}
    >
      <LogoMark tone={tone} />
      <span>
        open<span className={tone === 'ink' ? 'text-brand' : 'text-sky'}>sequence</span>
      </span>
    </span>
  );
}

export function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.21.7.82.58A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}
