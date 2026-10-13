# opensequence.dev

The landing page and its design system. Next.js (app router), Tailwind v4, shadcn/ui, Albert Sans
and IBM Plex Mono (self-hosted by `next/font`), code highlighted at build time with shiki. Static
export: `next build` writes `out/`. The docs are a separate deployment at `docs.opensequence.dev`
(`packages/docs`); every outbound link goes through `lib/links.ts`.

```bash
pnpm --filter @opensequence/site dev     # http://localhost:4321, the landing at /, the design system at /design
pnpm --filter @opensequence/site build   # out/
```

## Design system

Tokens and the type scale live in `app/globals.css`; the page at `/design` (noindex) shows every
token and component in both themes. Rules:

- **Framed ledger.** One 1120px column with hairline rails, sections on full-width rules, 64px
  bands between them. Content sits in `Cells`, whose grid gap is the hairline.
- **Monochrome, one state colour.** The primary button is ink on paper (paper on ink in dark).
  Azure (`brand`) marks only what was sent, what is live and what is selected.
- **Two faces, five steps.** Albert Sans 400 with tight tracking for headings and copy; Plex Mono
  for code and the uppercase labels. Use `.t-display`, `.t-h2`, `.t-h3`, `.t-lead`, `.t-body`,
  `.t-label`, `.t-code`; nothing in between.
- **Dark first.** `.dark` and `.light` (and `:root`) define the same tokens, so a panel can force
  either theme. Components read tokens only; never use Tailwind's `dark:` variant.
- **Works without JavaScript.** Tabs are a radio group driven by `:has()`, the FAQ is native
  `<details>`, the ledger animates in CSS. Two small inline scripts (`lib/scripts.ts`) handle the
  theme toggle and copy buttons. Nothing depends on the framework runtime.

Primitives: `components/ds/` (frame, marks, code card, tabs, accordion, controls, brand).
Sections: `components/site/`, one file each. Copy: `lib/content.ts`.

## Previews

`node scripts/preview.mjs out index.html <target.html> [--document]` turns a built page into one
self-contained file (CSS and fonts inlined, framework runtime removed) for preview hosts that
cannot serve `/_next/`. `--document` writes a full HTML document for local QA.

## Deploying on Vercel

Create the project with **Root Directory** `apps/site` (or `apps/opensequence/apps/site` while it
lives inside the host repository). `vercel.json` installs from the pnpm workspace root, builds,
serves `out/`, and sends the HSTS header `.dev` domains require. Add `opensequence.dev` as the
domain; previews come per pull request.
