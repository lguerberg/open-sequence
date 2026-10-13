# @opensequence/docs

The documentation site, published at https://docs.opensequence.dev. Built with [Fumadocs](https://fumadocs.dev) on Next.js, exported as static files.

```bash
pnpm --filter @opensequence/docs generate   # pull the sources of truth into generated/
pnpm --filter @opensequence/docs dev        # http://localhost:3000
pnpm --filter @opensequence/docs build      # generate + static export into out/
pnpm --filter @opensequence/docs typecheck
```

Layout (docs/ARCHITECTURE.md section 19):

| Path | What |
|---|---|
| `content/docs/{docs,api,sdks,reference}` | the hand-written pages, one folder per top tab, `meta.json` per folder for order and titles |
| `generated/` | written by `scripts/generate.ts`, gitignored, never edited: a copy of `openapi.json` with a `{baseUrl}` server variable, the configuration, CLI, definition schema, node catalogue, condition fields, webhook events and error code pages, and the `meta.json` of every API reference tag folder |
| `app/` | the Next.js app: one catch-all route for every page, static search index, `llms.txt`, `llms-full.txt`, and one Markdown file per page under `/llms.mdx/` |
| `components/` | MDX components with Mintlify's names (`Note`, `Tip`, `Warning`, `Info`, `Card`, `Cards`, `Steps`, `Step`, `Tabs`, `Tab`, `CodeGroup`, `Accordion`, `AccordionGroup`, `Frame`) |
| `lib/` | the content source (two collections merged with the virtual OpenAPI pages) and the OpenAPI server |

The API reference pages are not files: `fumadocs-openapi` builds one virtual page per operation from `generated/openapi.json`, grouped by tag, at build time.
