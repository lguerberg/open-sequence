import { llms, loader } from 'fumadocs-core/source';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import type { LoaderPlugin } from 'fumadocs-core/source';
import { z } from 'zod';
import { defineDocs } from 'fumadocs-mdx/macro';
import { openapi } from './openapi';
import { siteUrl } from './shared';
import { operationPageName } from './openapi-name';
import { treeIcon } from '@/components/logos';

/** The hand-written pages: content/docs/{docs,api,sdks,reference}. */
/** `nav`: the short sidebar label (one to three words). `title` stays the H1, the <title> and the llms.txt line. */
const docsPageSchema = pageSchema.extend({ nav: z.string().optional() });

const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: docsPageSchema,
    postprocess: { includeProcessedMarkdown: true },
  },
  meta: { schema: metaSchema },
});

/**
 * The generated pages, written by `pnpm generate` into generated/content with the same folder
 * layout as content/docs, so they merge into the same tree (reference/configuration.mdx lands
 * next to reference/glossary.mdx).
 */
const generated = defineDocs({
  dir: 'generated/content',
  docs: {
    schema: docsPageSchema,
    postprocess: { includeProcessedMarkdown: true },
  },
  meta: { schema: metaSchema },
});

/** One virtual page per operation, grouped by tag, under /api. The tag folders' meta.json files are generated. */
const apiReference = await openapi.staticSource({
  baseDir: 'api',
  per: 'operation',
  groupBy: 'tag',
  name: (entry) => (entry.type === 'operation' ? operationPageName(entry.item.method, entry.item.path) : entry.item.name),
});

/** The sidebar shows a page's `nav` label when it has one. */
const navLabels: LoaderPlugin = {
  name: 'opensequence:nav-labels',
  transformPageTree: {
    file(node, filePath) {
      if (!filePath) return node;
      const file = this.storage.read(filePath);
      const nav = file?.format === 'page' ? (file.data as { nav?: unknown }).nav : undefined;
      if (typeof nav === 'string' && nav) node.name = nav;
      return node;
    },
  },
};

export const source = loader(
  {
    docs: docs.toFumadocsSource(),
    generated: generated.toFumadocsSource(),
    // The key is the page `type` the page renderer switches on.
    openapi: apiReference,
  },
  {
    baseUrl: '/',
    // `icon` in frontmatter or meta.json: a module logo in the sidebar (components/logos.tsx).
    icon: treeIcon,
    plugins: [openapi.loaderPlugin(), navLabels],
  },
);

export type DocsPage = ReturnType<typeof source.getPage>;

/** llms.txt, llms-full.txt and the per-page Markdown. */
export const docsLlms = llms(source, {
  renderPage: async (page) => {
    if (page.type === 'openapi') {
      const props = page.data.getOpenAPIPageProps();
      const ops = (props.operations ?? []).map((o) => `${o.method.toUpperCase()} ${o.path}`).join(', ');
      return `# ${page.data.title} (${siteUrl}${page.url})\n\nAPI reference page for ${ops}. The full OpenAPI document is at ${siteUrl}/openapi.json.`;
    }
    return `# ${page.data.title} (${siteUrl}${page.url})\n\n${page.data.description ?? ''}\n\n${await page.data.getText('processed')}`;
  },
});
