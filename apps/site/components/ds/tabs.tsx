import { cn } from '@/lib/utils';

export type TabItem = { id: string; label: React.ReactNode; panel: React.ReactNode };

const variants = {
  /** Quiet pills, for small switches inside a card. */
  pills: {
    list: 'flex gap-1.5 overflow-x-auto',
    tab: 'rounded-xl px-3.5 py-2 text-[15px] text-muted-foreground hover:text-foreground',
    on: 'background:var(--surface);color:var(--foreground)',
  },
  /**
   * The side list of the code section: full-width rows on a hairline, the selected row tinted.
   * On phones the rows become a swipeable strip above the panel.
   */
  side: {
    list: 'flex gap-1.5 overflow-x-auto lg:flex-col lg:gap-0 lg:overflow-visible lg:border-t lg:border-border',
    tab: 'rounded-full border border-border bg-surface px-3 py-2 text-[15px] tracking-[-0.01em] text-foreground lg:rounded-none lg:border-0 lg:border-b lg:bg-transparent lg:px-2 lg:py-3 lg:text-[17px] hover:bg-surface-2 lg:hover:bg-surface',
    on: 'background:var(--peri);border-color:var(--peri)',
  },
} as const;

/**
 * Tabs with no JavaScript: a radio group drives which panel shows, through :has(). Keyboard users
 * get native radio behaviour (Tab to the group, arrows to switch); the labels are the visible tabs.
 */
export function Tabs({
  name,
  items,
  variant = 'pills',
  className,
  listClassName,
  panelsClassName,
}: {
  name: string;
  items: TabItem[];
  variant?: keyof typeof variants;
  className?: string;
  listClassName?: string;
  panelsClassName?: string;
}) {
  const v = variants[variant];
  const scope = `[data-tabs="${name}"]`;
  const css = items
    .map((i) => {
      const on = `${scope}:has(#${name}-${i.id}:checked)`;
      return [
        `${on} [data-panel="${i.id}"]{display:block}`,
        `${on} [data-tab="${i.id}"]{${v.on}}`,
        `${scope}:has(#${name}-${i.id}:focus-visible) [data-tab="${i.id}"]{outline:2px solid var(--ring);outline-offset:-2px}`,
      ].join('\n');
    })
    .join('\n');

  return (
    <div data-tabs={name} className={className}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">Choose an example</legend>
        {items.map((i, idx) => (
          <input
            key={i.id}
            type="radio"
            name={name}
            id={`${name}-${i.id}`}
            defaultChecked={idx === 0}
            className="sr-only"
          />
        ))}
        <div className={cn('no-scrollbar', v.list, listClassName)}>
          {items.map((i) => (
            <label
              key={i.id}
              htmlFor={`${name}-${i.id}`}
              data-tab={i.id}
              className={cn(
                'inline-flex shrink-0 cursor-pointer items-center gap-3 whitespace-nowrap transition-colors select-none',
                v.tab
              )}
            >
              {i.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className={cn('min-w-0', panelsClassName)}>
        {items.map((i) => (
          <div key={i.id} data-panel={i.id} className="hidden">
            {i.panel}
          </div>
        ))}
      </div>
    </div>
  );
}
