import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GithubIcon, Logo } from '@/components/ds/brand';
import { ThemeToggle } from '@/components/ds/controls';
import { links } from '@/lib/links';

const nav = [
  { href: '#use-cases', label: 'Use cases' },
  { href: '#value', label: 'Why own it' },
  { href: links.docs, label: 'Docs' },
  { href: links.api, label: 'API' },
  { href: links.changelog, label: 'Changelog' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-[68px] max-w-[1440px] items-center justify-between gap-6 px-5 sm:px-8">
        <a href="#top" aria-label="OpenSequence, back to top">
          <Logo />
        </a>
        <nav aria-label="Primary" className="hidden items-center gap-8 text-[15px] text-muted-foreground lg:flex">
          {nav.map((n) => (
            <a key={n.label} href={n.href} className="transition-colors hover:text-foreground">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a href={links.github} className="hidden h-9 items-center gap-2 rounded-full px-3 text-[14px] text-muted-foreground transition-colors hover:text-foreground sm:inline-flex">
            <GithubIcon className="size-4" /> GitHub
          </a>
          <ThemeToggle />
          <Button asChild size="sm" className="h-9 px-4">
            <a href={links.quickstart}>
              Get started <ArrowRight className="size-3.5" />
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}
