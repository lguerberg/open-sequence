import { execFileSync } from 'node:child_process';
import { type Folder, findPath, flattenTree } from 'fumadocs-core/page-tree';
import type { Metadata } from 'next';
import { absoluteUrl, contentDir, getPageImage, getPageMarkdownUrl, projectUrl, repoBranch, repoUrl, siteDescription, siteName, siteTitle, siteUrl } from './shared';
import { source } from './source';

/**
 * Everything a search engine or a link preview reads from a page: the title, the description,
 * the canonical URL, the Open Graph card, the breadcrumb and the JSON-LD. Computed at build
 * time only (static export).
 */

type Page = NonNullable<ReturnType<typeof source.getPage>>;

/** The page's operations, for an API reference page: `POST /v1/contacts:batch`. */
export function operations(page: Page): { method: string; path: string }[] {
  if (page.type !== 'openapi') return [];
  return (page.data.getOpenAPIPageProps().operations ?? []).map((o) => ({ method: o.method.toUpperCase(), path: o.path }));
}

/**
 * The folders above a page in the sidebar, outermost first, each with the URL a reader lands on
 * when they open it (its index page, or its first page): `Docs (/docs)`, `Self-hosting (/docs/self-hosting/install)`.
 */
export function pageFolders(page: Page): { name: string; url?: string }[] {
  const path = findPath(source.getPageTree().children, (node) => node.type === 'page' && node.url === page.url) ?? [];
  return path
    .filter((node): node is Folder => node.type === 'folder')
    .map((folder) => ({
      name: typeof folder.name === 'string' ? folder.name : '',
      url: folder.index?.url ?? flattenTree(folder.children)[0]?.url,
    }))
    .filter((folder) => folder.name);
}

/** The folder names above a page: `["Docs", "Self-hosting"]`. */
export function sectionNames(page: Page): string[] {
  return pageFolders(page).map((folder) => folder.name);
}

let titleCounts: Map<string, number> | undefined;

/**
 * The page's `<title>` (before the site suffix). A title two pages share gets its section, so
 * every page keeps a unique one: `Configuration (Self-hosting)` and `Configuration (Reference)`.
 */
export function pageTitle(page: Page): string {
  titleCounts ??= source.getPages().reduce((m, p) => m.set(p.data.title ?? '', (m.get(p.data.title ?? '') ?? 0) + 1), new Map<string, number>());
  const title = shortTitle(page, page.data.title ?? '');
  if ((titleCounts.get(title) ?? 0) < 2) return title;
  const section = sectionNames(page).at(-1);
  return section ? `${title} (${section})` : title;
}

/**
 * An API page's title is its route's one-line summary, which can run past 100 characters. For the
 * `<title>`, keep the first clause: "Remove a channel; its steps skip from now on. ..." becomes "Remove a channel".
 * The page's heading keeps the whole summary.
 */
function shortTitle(page: Page, title: string): string {
  if (page.type !== 'openapi' || title.length <= 60) return title;
  const clause = title.split(/[:;(]| \u2014 /)[0]!.trim();
  return clause.length >= 12 ? clause : title;
}

/** The meta description: the frontmatter one, or for an API page a sentence built from its operation. */
export function pageDescription(page: Page): string {
  if (page.data.description) return metaDescription(page.data.description);
  const ops = operations(page);
  if (ops.length > 0) {
    const summary = (page.data.title ?? '').replace(/\.$/, '');
    const op = ops.map((o) => `${o.method} ${o.path}`).join(', ');
    return metaDescription(`${summary}. ${op}: parameters, request body and responses.`);
  }
  return siteDescription;
}

/** Search results show about 160 characters: cut at the last sentence, else the last word, that fits. */
export function metaDescription(text: string, max = 160): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentence = cut.lastIndexOf('. ');
  if (sentence >= 70) return cut.slice(0, sentence + 1);
  return `${cut.slice(0, cut.lastIndexOf(' ', max - 1)).replace(/[,;:]$/, '')}…`;
}

/** Above this, " · OpenSequence docs" would push the page's own words out of the search result. */
const TITLE_WITH_SUFFIX_MAX = 65;

/** The repository file a page is built from, for "edit on GitHub" and for its last modified date. */
export function pageSourceFile(page: Page): string {
  if (page.type === 'openapi') return 'apps/server/openapi.json';
  if (page.type === 'generated') return 'packages/docs/scripts/generate.ts';
  return `${contentDir}/${page.path}`;
}

export function pageGithubUrl(page: Page): string {
  return `${repoUrl}/blob/${repoBranch}/${pageSourceFile(page)}`;
}

let gitDates: Map<string, string> | undefined;

/** The date of the last commit that touched each file, from one `git log` at build time. */
function lastCommitDates(): Map<string, string> {
  if (gitDates) return gitDates;
  gitDates = new Map();
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    const log = execFileSync('git', ['log', '--format=%x00%cI', '--name-only', '--', contentDir, 'packages/docs/scripts/generate.ts', 'apps/server/openapi.json'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    for (const chunk of log.split('\0')) {
      const [date, ...files] = chunk.trim().split('\n');
      if (!date) continue;
      for (const file of files) if (file && !gitDates.has(file)) gitDates.set(file, date);
    }
  } catch {
    // Not a git checkout (or no git): fall back to the build time.
  }
  return gitDates;
}

const buildTime = new Date().toISOString();

/** When the page last changed: its source file's last commit, or the build time. */
export function pageLastModified(page: Page): string {
  return lastCommitDates().get(pageSourceFile(page)) ?? buildTime;
}

/** The fields every page's Open Graph and Twitter metadata share. */
export function socialMetadata(input: { title: string; description: string; url: string; image: string; type?: 'website' | 'article' }): Pick<Metadata, 'openGraph' | 'twitter'> {
  const image = { url: input.image, width: 1200, height: 630, alt: input.title };
  return {
    openGraph: {
      type: input.type ?? 'website',
      siteName: siteTitle,
      locale: 'en_US',
      title: input.title,
      description: input.description,
      url: input.url,
      images: [image],
    },
    twitter: { card: 'summary_large_image', title: input.title, description: input.description, images: [image] },
  };
}

/** The metadata of a docs page: unique title, description, canonical URL, Markdown alternate, social card. */
export function pageMetadata(page: Page): Metadata {
  const title = pageTitle(page);
  const description = pageDescription(page);
  return {
    // A long title drops the site suffix rather than the page's own words.
    title: `${title} · ${siteTitle}`.length > TITLE_WITH_SUFFIX_MAX ? { absolute: title } : title,
    description,
    alternates: { canonical: page.url, types: { 'text/markdown': getPageMarkdownUrl(page).url } },
    ...socialMetadata({ title, description, url: page.url, image: getPageImage(page.slugs).url, type: 'article' }),
  };
}

const organization = {
  '@type': 'Organization',
  '@id': `${projectUrl}/#organization`,
  name: siteName,
  url: projectUrl,
  logo: absoluteUrl('/apple-icon.png'),
  sameAs: [repoUrl],
};

const website = {
  '@type': 'WebSite',
  '@id': `${siteUrl}/#website`,
  name: siteTitle,
  url: siteUrl,
  description: siteDescription,
  inLanguage: 'en',
  publisher: { '@id': organization['@id'] },
};

/** JSON-LD for the home page: the site and the organization behind it. */
export function homeJsonLd() {
  return { '@context': 'https://schema.org', '@graph': [website, organization] };
}

/** JSON-LD for a docs page: a TechArticle and its breadcrumb. */
export function pageJsonLd(page: Page) {
  const url = absoluteUrl(page.url);
  // Every item but the last needs a URL; a folder whose landing page is the page itself is left out.
  const folders = pageFolders(page).filter((c): c is { name: string; url: string } => Boolean(c.url && c.url !== page.url));
  const items = [{ name: siteTitle, url: '/' }, ...folders, { name: pageTitle(page), url: page.url }];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        '@id': `${url}#article`,
        headline: pageTitle(page),
        description: pageDescription(page),
        url,
        mainEntityOfPage: url,
        image: absoluteUrl(getPageImage(page.slugs).url),
        dateModified: pageLastModified(page),
        inLanguage: 'en',
        isPartOf: { '@id': website['@id'] },
        publisher: { '@id': organization['@id'] },
        author: { '@id': organization['@id'] },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: items.map((c, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: c.name,
          item: absoluteUrl(c.url),
        })),
      },
      website,
      organization,
    ],
  };
}

/** A `<script type="application/ld+json">` body, with `<` escaped so content can never close the tag. */
export function jsonLdHtml(data: unknown): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, '\\u003c') };
}
