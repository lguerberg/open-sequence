import { Logo } from '@/components/ds/brand';
import { Cells } from '@/components/ds/frame';
import { Label } from '@/components/ds/marks';
import { links } from '@/lib/links';

const cols = [
  { title: 'Product', items: [['Quickstart', links.quickstart], ['Docs', links.docs], ['API reference', links.api], ['TypeScript SDK', links.sdk]] },
  { title: 'Open source', items: [['GitHub', links.github], ['Architecture', links.architecture], ['Changelog', links.changelog], ['Issues', links.issues]] },
  { title: 'Trust', items: [['Security', links.security], ['Webhooks', links.webhooks], ['Configuration', links.configuration], ['Extending', links.extending]] },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-b border-border">
      <div className="frame">
        <Cells className="sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <div className="p-6 sm:p-10">
            <Logo />
            <p className="t-body mt-4 max-w-xs">The open source sequencing service for any CRM.</p>
          </div>
          {cols.map((c) => (
            <nav key={c.title} aria-label={c.title} className="p-6 sm:p-10">
              <Label as="h3" className="text-muted-foreground">{c.title}</Label>
              <ul className="mt-5 flex list-none flex-col gap-3 p-0 text-[15px]">
                {c.items.map(([label, href]) => (
                  <li key={label}>
                    <a href={href} className="text-foreground/80 transition-colors hover:text-foreground">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </Cells>
        <div className="flex flex-col gap-2 border-t border-border px-6 py-5 font-mono text-[12px] text-subtle-foreground sm:flex-row sm:justify-between sm:px-10">
          <span>© 2026 OpenSequence · Apache-2.0</span>
          <span>opensequence.dev</span>
        </div>
      </div>
    </footer>
  );
}
