import { cn } from '@/lib/utils';

export type TabItem = { id: string; label: React.ReactNode; panel: React.ReactNode };

const labelStyles = {
  /** Quiet pills, for small switches inside a cell. */
  pills: 'rounded-full border border-transparent px-3.5 py-2 text-[14px] text-muted-foreground hover:text-foreground',
  /** Hairline tiles, the use-case switcher: icon muted at rest, azure when selected. */
  tiles: 'rounded-md border border-border bg-background px-2.5 py-2 text-[14px] text-muted-foreground hover:bg-surface hover:text-foreground [&_svg]:text-subtle-foreground',
} as const;

/**
 * Tabs with no JavaScript: a radio group drives which panel shows, through :has(). Keyboard users
 * get native radio behaviour (Tab to the group, arrows to switch); the labels are the visible tabs.
 */
export function Tabs({ name, items, variant = 'pills', className, listClassName, panelsClassName }: { name: string; items: TabItem[]; variant?: keyof typeof labelStyles; className?: string; listClassName?: string; panelsClassName?: string }) {
  const scope = `[data-tabs="${name}"]`;
  const css = items
    .map((i) => {
      const on = `${scope}:has(#${name}-${i.id}:checked)`;
      return [
        `${on} [data-panel="${i.id}"]{display:block}`,
        `${on} [data-tab="${i.id}"]{background:var(--surface-2);border-color:var(--border);color:var(--foreground)}`,
        `${on} [data-tab="${i.id}"] svg{color:var(--brand)}`,
        `${scope}:has(#${name}-${i.id}:focus-visible) [data-tab="${i.id}"]{outline:2px solid var(--ring);outline-offset:2px}`,
      ].join('\n');
    })
    .join('\n');

  return (
    <div data-tabs={name} className={className}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">Choose an example</legend>
        {items.map((i, idx) => (
          <input key={i.id} type="radio" name={name} id={`${name}-${i.id}`} defaultChecked={idx === 0} className="sr-only" />
        ))}
        <div className={cn('no-scrollbar flex gap-1.5 overflow-x-auto', listClassName)}>
          {items.map((i) => (
            <label key={i.id} htmlFor={`${name}-${i.id}`} data-tab={i.id} className={cn('inline-flex shrink-0 cursor-pointer items-center gap-2.5 whitespace-nowrap transition-colors select-none', labelStyles[variant])}>
              {i.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className={panelsClassName}>
        {items.map((i) => (
          <div key={i.id} data-panel={i.id} className="hidden">
            {i.panel}
          </div>
        ))}
      </div>
    </div>
  );
}
