import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GithubIcon, Logo } from '@/components/ds/brand';
import { links } from '@/lib/links';

const nav = [
  { href: '#use-cases', label: 'Use cases' },
  { href: '#value', label: 'Why own it' },
  { href: links.docs, label: 'Docs' },
  { href: links.api, label: 'API' },
  { href: links.changelog, label: 'Changelog' },
];

/** Logo, the links in one light pill, then GitHub and the blue call to action. */
export function SiteHeader() {
  return (
    <header id="top" className="wrap flex h-24 items-center justify-between gap-3 sm:h-28 sm:gap-6">
      <a href="#top" aria-label="OpenSequence, back to top" className="shrink-0">
        <Logo />
      </a>
      <nav
        aria-label="Primary"
        className="hidden h-12 items-center gap-1 rounded-full bg-surface px-1.5 lg:flex"
      >
        {nav.map((n) => (
          <a
            key={n.label}
            href={n.href}
            className="rounded-full px-4 py-2 text-[15px] font-medium tracking-[-0.01em] transition-colors hover:bg-surface-2"
          >
            {n.label}
          </a>
        ))}
      </nav>
      <div className="flex items-center gap-2 sm:gap-3">
        <Button
          asChild
          variant="light"
          size="sm"
          className="hidden h-12 bg-surface hover:bg-surface-2 sm:inline-flex"
        >
          <a href={links.github}>
            <GithubIcon className="size-4" /> GitHub
          </a>
        </Button>
        <Button asChild size="sm" className="h-11 sm:h-12">
          <a href={links.quickstart}>
            <span className="sm:hidden">Start</span>
            <span className="hidden sm:inline">Get started</span>
            <ArrowRight className="hidden size-4 sm:block" />
          </a>
        </Button>
      </div>
    </header>
  );
}
