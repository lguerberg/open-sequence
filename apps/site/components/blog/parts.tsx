import { ArrowRight } from 'lucide-react';
import { Mark } from '@/components/ds/marks';
import { formatDate, type Post, type TocItem } from '@/lib/blog';
import { cn } from '@/lib/utils';

/** Home / Blog / title, as an ordered list with the current page marked. */
export function Breadcrumb({ title }: { title: string }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="m-0 flex list-none flex-wrap items-center gap-x-2 gap-y-1 p-0 font-mono text-[13px] text-muted-foreground">
        <li>
          <a href="/" className="transition-colors hover:text-foreground">
            Home
          </a>
        </li>
        <li aria-hidden="true" className="text-faint">
          /
        </li>
        <li>
          <a href="/blog" className="transition-colors hover:text-foreground">
            Blog
          </a>
        </li>
        <li aria-hidden="true" className="text-faint">
          /
        </li>
        <li aria-current="page" className="min-w-0 truncate text-foreground">
          {title}
        </li>
      </ol>
    </nav>
  );
}

export function Tags({ tags, className }: { tags: string[]; className?: string }) {
  if (!tags.length) return null;
  return (
    <ul className={cn('m-0 flex list-none flex-wrap gap-2 p-0', className)} aria-label="Tags">
      {tags.map((t) => (
        <li
          key={t}
          className="rounded-full border border-border bg-background px-2.5 py-0.5 font-mono text-[12px] text-ink-2"
        >
          {t}
        </li>
      ))}
    </ul>
  );
}

/** Author, published date, updated date when it differs, and reading time. */
export function PostMeta({ post }: { post: Post }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[13px] text-muted-foreground">
      <span>
        By <span className="text-foreground">{post.author}</span>
      </span>
      <span aria-hidden="true" className="text-faint">
        ·
      </span>
      <time dateTime={post.date}>{formatDate(post.date)}</time>
      {post.updated !== post.date ? (
        <>
          <span aria-hidden="true" className="text-faint">
            ·
          </span>
          <span>
            Updated <time dateTime={post.updated}>{formatDate(post.updated)}</time>
          </span>
        </>
      ) : null}
      <span aria-hidden="true" className="text-faint">
        ·
      </span>
      <span>{post.readingMinutes} min read</span>
    </p>
  );
}

/** One post in a list: the whole card is the link. */
export function PostCard({
  post,
  headingLevel: H = 'h2',
}: {
  post: Post;
  headingLevel?: 'h2' | 'h3';
}) {
  return (
    <article className="group relative flex h-full flex-col rounded-[24px] bg-surface p-6 transition-colors hover:bg-surface-2 sm:p-8">
      <p className="font-mono text-[13px] text-muted-foreground">
        <time dateTime={post.date}>{formatDate(post.date)}</time>
        <span aria-hidden="true" className="mx-2 text-faint">
          ·
        </span>
        {post.readingMinutes} min read
      </p>
      <H className="mt-4 font-display text-[clamp(28px,2.6vw,36px)] leading-[1.05] tracking-[-0.01em]">
        <a
          href={`/blog/${post.slug}`}
          className="after:absolute after:inset-0 after:rounded-[24px]"
        >
          {post.h1}
        </a>
      </H>
      <p className="mt-3 text-[16px] leading-[1.5] tracking-[-0.01em] text-ink-2">
        {post.description}
      </p>
      <div className="mt-auto flex items-end justify-between gap-4 pt-6">
        <Tags tags={post.tags} />
        <ArrowRight
          aria-hidden="true"
          className="size-5 shrink-0 text-brand transition-transform group-hover:translate-x-1"
        />
      </div>
    </article>
  );
}

function TocList({ toc }: { toc: TocItem[] }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
      {toc.map((t) => (
        <li key={t.id}>
          <a
            href={`#${t.id}`}
            className="flex gap-2.5 rounded-lg px-2 py-1.5 text-[14.5px] leading-[1.35] tracking-[-0.01em] text-ink-2 transition-colors hover:bg-surface hover:text-foreground"
          >
            <Mark className="mt-[5px] size-1.5" />
            <span>{t.text}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

/** The sticky contents column beside the article on large screens. */
export function TocAside({ toc }: { toc: TocItem[] }) {
  if (toc.length < 2) return null;
  return (
    <nav
      aria-label="On this page"
      className="sticky top-8 max-h-[calc(100dvh-4rem)] overflow-y-auto"
    >
      <p className="t-label px-2 text-muted-foreground">On this page</p>
      <div className="mt-4">
        <TocList toc={toc} />
      </div>
    </nav>
  );
}

/** Above the article on small screens: the same contents, folded in a native details element. */
export function TocDisclosure({ toc }: { toc: TocItem[] }) {
  if (toc.length < 2) return null;
  return (
    <details className="toc-disclosure mb-10 rounded-[20px] bg-surface px-4 py-3 lg:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between py-1 font-mono text-[13px] font-medium tracking-[0.08em] uppercase">
        On this page
        <span aria-hidden="true" className="toc-caret text-[18px] leading-none text-brand">
          +
        </span>
      </summary>
      <nav aria-label="On this page" className="mt-2 pb-1">
        <TocList toc={toc} />
      </nav>
    </details>
  );
}
