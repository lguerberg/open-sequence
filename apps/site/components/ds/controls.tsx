import { Check, ChevronRight, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

const tones = {
  /** On the celeste band: a white well, navy text. */
  band: 'border-white/70 bg-white/45 text-foreground hover:bg-white/70 [&_.cmd-prompt]:text-ink-2 [&_.cmd-icon]:text-ink-2',
  /** On the ground or a card. */
  light:
    'border-border bg-surface text-foreground hover:bg-white [&_.cmd-prompt]:text-subtle-foreground [&_.cmd-icon]:text-subtle-foreground',
  /** On the dark footer or code. */
  dark: 'border-white/15 bg-white/5 text-[#e9eded] hover:bg-white/10 [&_.cmd-prompt]:text-[#8b9696] [&_.cmd-icon]:text-[#8b9696]',
} as const;

/** A command or prompt you can copy. Works with the inline script; without it, the text stays selectable. */
export function CopyCommand({
  command,
  tone = 'light',
  className,
}: {
  command: string;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-copy={command}
      aria-label={`Copy: ${command}`}
      className={cn(
        'group flex min-h-14 w-full min-w-0 items-center gap-3 rounded-2xl border px-5 py-3 text-left font-mono text-[14px] transition-colors sm:text-[15px]',
        tones[tone],
        className
      )}
    >
      <ChevronRight className="cmd-prompt size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
      <span className="min-w-0 flex-1 break-words select-all">{command}</span>
      <span className="cmd-icon copy-idle shrink-0">
        <Copy className="size-4" strokeWidth={1.75} />
      </span>
      <span className="copy-done shrink-0 text-lime">
        <Check className="size-4" strokeWidth={2} />
      </span>
    </button>
  );
}
