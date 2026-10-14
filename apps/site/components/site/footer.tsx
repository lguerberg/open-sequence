import { Logo } from '@/components/ds/brand';
import { links } from '@/lib/links';

const cols = [
  {
    title: 'Product',
    items: [
      ['Quickstart', links.quickstart],
      ['Docs', links.docs],
      ['API reference', links.api],
      ['TypeScript SDK', links.sdk],
    ],
  },
  {
    title: 'Open source',
    items: [
      ['GitHub', links.github],
      ['Architecture', links.architecture],
      ['Changelog', links.changelog],
      ['Issues', links.issues],
    ],
  },
  {
    title: 'Trust',
    items: [
      ['Security', links.security],
      ['Webhooks', links.webhooks],
      ['Configuration', links.configuration],
      ['Extending', links.extending],
    ],
  },
] as const;

/** The dark footer: sans column titles, mono links, a hairline, the fine print. */
export function SiteFooter() {
  return (
    <footer className="bg-foreground text-surface">
      <div className="wrap grid gap-10 py-14 sm:grid-cols-2 sm:py-16 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <div>
          <Logo tone="light" />
          <p className="mt-5 max-w-xs font-mono text-[14px] leading-[1.4] text-faint">
            The open source sequencing service for any CRM.
          </p>
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h3 className="text-[16px] font-semibold tracking-[-0.02em]">{c.title}</h3>
            <ul className="m-0 mt-5 flex list-none flex-col gap-3.5 p-0 font-mono text-[14px]">
              {c.items.map(([label, href]) => (
                <li key={label}>
                  <a href={href} className="text-faint transition-colors hover:text-surface">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="wrap flex flex-col gap-2 py-6 font-mono text-[12px] text-faint sm:flex-row sm:justify-between">
          <span>© 2026 OpenSequence · Apache-2.0</span>
          <a
            href={links.github}
            className="underline decoration-1 underline-offset-4 hover:text-surface"
          >
            Source on GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
