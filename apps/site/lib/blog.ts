import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type { Element, ElementContent, Root as HastRoot } from 'hast';
import { toString as hastToString } from 'hast-util-to-string';
import type { Root as MdastRoot } from 'mdast';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { bundledLanguages, codeToHast } from 'shiki';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import type { VFile } from 'vfile';
import { z } from 'zod';

/**
 * The blog: markdown files in content/blog, read and rendered at build time. A bad file fails the
 * build with the file name and the rule it broke, so nothing half-valid reaches the static export.
 * Files whose name starts with `_` are drafts and are skipped.
 */

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog');
const WORDS_PER_MINUTE = 230;

export type TocItem = { id: string; text: string };
export type FaqItem = { q: string; a: string };

export type Post = {
  slug: string;
  /** The page <title>, at most 60 characters. */
  title: string;
  /** The on-page headline; the title when the file does not set one. */
  h1: string;
  description: string;
  /** ISO dates, YYYY-MM-DD. */
  date: string;
  updated: string;
  author: string;
  tags: string[];
  keyword?: string;
  html: string;
  toc: TocItem[];
  faq: FaqItem[];
  wordCount: number;
  readingMinutes: number;
};

/** YAML turns `2026-10-14` into a Date; a quoted date stays a string. Both end up as YYYY-MM-DD. */
const isoDate = z.preprocess(
  (v) => (v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString().slice(0, 10) : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date written YYYY-MM-DD')
    .refine((s) => !Number.isNaN(Date.parse(s)), 'is not a real date')
);

const frontmatter = z.object({
  title: z.string().trim().min(1, 'is required').max(60, 'must be 60 characters or fewer'),
  h1: z.string().trim().min(1).optional(),
  description: z
    .string()
    .trim()
    .min(110, 'must be at least 110 characters')
    .max(165, 'must be 165 characters or fewer'),
  date: isoDate,
  updated: isoDate.optional(),
  author: z.string().trim().min(1).default('Leo Guerberg'),
  tags: z.array(z.string().trim().min(1)).default([]),
  keyword: z.string().trim().min(1).optional(),
});

class BlogContentError extends Error {
  constructor(file: string, problem: string) {
    super(`content/blog/${file}: ${problem}`);
    this.name = 'BlogContentError';
  }
}

type PostData = { toc: TocItem[]; faq: FaqItem[]; wordCount: number };

/** Fails on an h1 in the body (the page owns the h1) and warns on raw HTML, which is dropped. */
function remarkGuard() {
  return (tree: MdastRoot, file: VFile) => {
    visit(tree, (node) => {
      if (node.type === 'heading' && node.depth === 1) {
        const line = node.position?.start.line;
        throw new BlogContentError(
          String(file.basename),
          `h1 in the body${line ? ` (line ${line} of the markdown)` : ''}. Use ## and ###; the page renders the title as the h1.`
        );
      }
      if (node.type === 'html') {
        console.warn(
          `[blog] content/blog/${file.basename}: raw HTML is not rendered (line ${node.position?.start.line}).`
        );
      }
    });
  };
}

function isElement(node: unknown, tag?: string): node is Element {
  const n = node as Element | undefined;
  return n?.type === 'element' && (tag === undefined || n.tagName === tag);
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Runs after rehype-slug and before the heading anchors are added, so the text is clean: the table
 * of contents (every h2), the FAQ (the h3s under `## FAQ` and the text until the next h3) and the
 * word count.
 */
function rehypeCollect() {
  return (tree: HastRoot, file: VFile) => {
    const toc: TocItem[] = [];
    const faq: FaqItem[] = [];
    let inFaq = false;
    for (const node of tree.children) {
      if (!isElement(node)) continue;
      if (node.tagName === 'h2') {
        const text = squash(hastToString(node));
        toc.push({ id: String(node.properties.id ?? ''), text });
        inFaq = text === 'FAQ';
      } else if (inFaq && node.tagName === 'h3') {
        faq.push({ q: squash(hastToString(node)), a: '' });
      } else if (inFaq && faq.length > 0) {
        const last = faq[faq.length - 1]!;
        last.a = squash(`${last.a} ${hastToString(node)}`);
      }
    }
    const wordCount = hastToString(tree).split(/\s+/).filter(Boolean).length;
    (file.data as Partial<PostData>).toc = toc;
    (file.data as Partial<PostData>).faq = faq.filter((f) => f.a);
    (file.data as Partial<PostData>).wordCount = wordCount;
  };
}

/**
 * Links, tables and code. External links get rel="noopener" (and no nofollow: the docs and GitHub
 * are ours). Tables scroll in their own box. Code is highlighted with shiki in the landing's theme
 * and set on the dark code card, with the same copy button.
 */
function rehypeBlogElements({ slugs }: { slugs: Set<string> }) {
  return async (tree: HastRoot, file: VFile) => {
    const code: { node: Element; index: number; parent: { children: ElementContent[] } }[] = [];

    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName === 'a') {
        const href = String(node.properties.href ?? '');
        if (/^https?:\/\//.test(href)) node.properties.rel = ['noopener'];
        const internal = href.match(/^\/blog\/([^/#?]+)/);
        if (internal && !slugs.has(internal[1]!)) {
          console.warn(
            `[blog] content/blog/${file.basename}: link to ${href}, which has no post yet.`
          );
        }
      }
      if (node.tagName === 'table' && parent && index !== undefined) {
        parent.children[index] = {
          type: 'element',
          tagName: 'div',
          properties: {
            className: ['table-wrap'],
            role: 'region',
            ariaLabel: 'Table, scrolls sideways',
            tabIndex: 0,
          },
          children: [node],
        };
        return 'skip';
      }
      if (
        node.tagName === 'pre' &&
        parent &&
        index !== undefined &&
        isElement(node.children[0], 'code')
      ) {
        code.push({ node, index, parent: parent as { children: ElementContent[] } });
        return 'skip';
      }
      return undefined;
    });

    for (const { node, index, parent } of code) {
      const codeEl = node.children[0] as Element;
      const classes = (codeEl.properties.className as string[] | undefined) ?? [];
      const label =
        classes.find((c) => c.startsWith('language-'))?.slice('language-'.length) ?? 'text';
      const lang = label in bundledLanguages ? label : 'text';
      const source = hastToString(codeEl).replace(/\n$/, '');
      const highlighted = await codeToHast(source, { lang, theme: 'tokyo-night' });
      const pre = highlighted.children.find((c) => isElement(c, 'pre')) as Element;
      parent.children[index] = {
        type: 'element',
        tagName: 'figure',
        properties: { className: ['code-block'] },
        children: [
          {
            type: 'element',
            tagName: 'figcaption',
            properties: {},
            children: [
              {
                type: 'element',
                tagName: 'span',
                properties: { className: ['code-tag'] },
                children: [{ type: 'text', value: label }],
              },
              {
                type: 'element',
                tagName: 'button',
                properties: {
                  type: 'button',
                  className: ['code-copy'],
                  dataCopy: source,
                  ariaLabel: 'Copy the code',
                },
                children: [
                  {
                    type: 'element',
                    tagName: 'span',
                    properties: { className: ['copy-idle'] },
                    children: [{ type: 'text', value: 'Copy' }],
                  },
                  {
                    type: 'element',
                    tagName: 'span',
                    properties: { className: ['copy-done'] },
                    children: [{ type: 'text', value: 'Copied' }],
                  },
                ],
              },
            ],
          },
          pre,
        ],
      };
    }
  };
}

function processor(slugs: Set<string>) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkGuard)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeCollect)
    .use(rehypeAutolinkHeadings, {
      behavior: 'append',
      test: ['h2', 'h3'],
      properties: { className: ['heading-anchor'], ariaHidden: 'true', tabIndex: -1 },
      content: { type: 'text', value: '#' },
    })
    .use(rehypeBlogElements, { slugs })
    .use(rehypeStringify);
}

function postFiles(): string[] {
  if (!fs.existsSync(BLOG_DIR)) return [];
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_') && !f.startsWith('.'))
    .sort();
}

async function readPost(file: string, slugs: Set<string>): Promise<Post> {
  const slug = file.replace(/\.md$/, '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new BlogContentError(
      file,
      'the file name must be the slug: lowercase words joined by -.'
    );
  }
  const raw = fs.readFileSync(path.join(BLOG_DIR, file), 'utf8');
  // gray-matter caches by content; pass a fresh options object so each read is parsed anew.
  const { data, content } = matter(raw, {});
  const parsed = frontmatter.safeParse(data);
  if (!parsed.success) {
    throw new BlogContentError(file, `invalid frontmatter.\n${z.prettifyError(parsed.error)}`);
  }
  const fm = parsed.data;
  const updated = fm.updated ?? fm.date;
  if (updated < fm.date) throw new BlogContentError(file, 'updated is before date.');

  const vfile = await processor(slugs).process({ value: content, basename: file });
  const { toc, faq, wordCount } = vfile.data as PostData;
  return {
    slug,
    title: fm.title,
    h1: fm.h1 ?? fm.title,
    description: fm.description,
    date: fm.date,
    updated,
    author: fm.author,
    tags: fm.tags,
    keyword: fm.keyword,
    html: String(vfile),
    toc,
    faq,
    wordCount,
    readingMinutes: Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE)),
  };
}

let cache: Promise<Post[]> | undefined;

async function loadPosts(): Promise<Post[]> {
  const files = postFiles();
  const slugs = new Set(files.map((f) => f.replace(/\.md$/, '')));
  const posts = await Promise.all(files.map((f) => readPost(f, slugs)));
  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

/** Every published post, newest first. Read once per build; re-read on every call in dev. */
export function getAllPosts(): Promise<Post[]> {
  if (process.env.NODE_ENV !== 'production') return loadPosts();
  cache ??= loadPosts();
  return cache;
}

export async function getPost(slug: string): Promise<Post | undefined> {
  return (await getAllPosts()).find((p) => p.slug === slug);
}

/** Up to three other posts: most shared tags first, then the newest. */
export function relatedPosts(post: Post, all: Post[], limit = 3): Post[] {
  const tags = new Set(post.tags);
  return all
    .filter((p) => p.slug !== post.slug)
    .map((p) => ({ p, shared: p.tags.filter((t) => tags.has(t)).length }))
    .sort((a, b) => b.shared - a.shared || b.p.date.localeCompare(a.p.date))
    .slice(0, limit)
    .map(({ p }) => p);
}

/** "October 14, 2026", read in UTC so the date never shifts with the build machine's zone. */
export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** The page <title>: the post title, with the brand appended only while it stays within 60 characters. */
export function documentTitle(post: Post): string {
  const branded = `${post.title} · OpenSequence`;
  return branded.length <= 60 ? branded : post.title;
}

export const BLOG_TITLE = 'Blog';
export const BLOG_DESCRIPTION =
  'Notes on owning your sales sequencing: cost breakdowns, tool comparisons, deliverability and how to run outreach sequences on infrastructure you control.';
