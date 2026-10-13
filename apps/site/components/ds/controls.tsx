import { Check, Copy, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Toggles the theme through the inline script; the icon follows the class on <html>. */
export function ThemeToggle({ className }: { className?: string }) {
  return (
    <button type="button" data-theme-toggle aria-label="Toggle light and dark theme" className={cn('grid size-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground', className)}>
      <Sun className="icon-sun size-4" strokeWidth={1.5} />
      <Moon className="icon-moon size-4" strokeWidth={1.5} />
    </button>
  );
}

/** A command you can copy. Works with the inline script; without it, the text stays selectable. */
export function CopyCommand({ command, className }: { command: string; className?: string }) {
  return (
    <button type="button" data-copy={command} aria-label={`Copy: ${command}`} className={cn('group inline-flex h-10 items-center gap-3 rounded-full border border-border bg-surface px-4 font-mono text-[13px] text-foreground transition-colors hover:bg-surface-2', className)}>
      <span className="text-subtle-foreground select-none">$</span>
      <span className="select-all">{command}</span>
      <span className="copy-idle text-subtle-foreground group-hover:text-foreground">
        <Copy className="size-3.5" strokeWidth={1.5} />
      </span>
      <span className="copy-done text-ok">
        <Check className="size-3.5" strokeWidth={2} />
      </span>
    </button>
  );
}
