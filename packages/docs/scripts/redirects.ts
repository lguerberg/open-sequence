/**
 * Writes the redirects in lib/redirects.ts after `next build`:
 *
 *   out/<old path>.html   a small page per moved URL: noindex, a canonical link to the new page,
 *                         a meta refresh and a script that keeps the #hash. Static hosts serve it
 *                         at the old URL, the way they serve every exported page.
 *   vercel.json           the same list as permanent (308) redirects, for the hosted deploy.
 *
 * The stubs are not pages of the source, so the sitemap and the search index never list them.
 * Run with tsx from the package folder (the build script does).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { redirects } from '../lib/redirects.ts';
import { siteUrl } from '../lib/shared.ts';

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(pkg, 'out');

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stub(to: string): string {
  const href = escape(to);
  const absolute = escape(`${siteUrl}${to}`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Moved · OpenSequence docs</title>
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${absolute}">
<meta http-equiv="refresh" content="0; url=${href}">
<script>location.replace(${JSON.stringify(to)} + location.hash)</script>
</head>
<body>
<p>This page moved to <a href="${href}">${absolute}</a>.</p>
</body>
</html>
`;
}

async function main(): Promise<void> {
  const pages = Object.entries(redirects);
  for (const [from, to] of pages) {
    if (!from.startsWith('/') || !to.startsWith('/')) throw new Error(`Redirect paths must start with "/": ${from} -> ${to}`);
    if (redirects[to]) throw new Error(`Redirect chain: ${from} -> ${to} -> ${redirects[to]}. Point ${from} at the final page.`);
  }

  if (existsSync(out)) {
    for (const [from, to] of pages) {
      const target = to === '/' ? path.join(out, 'index.html') : path.join(out, `${to}.html`);
      if (!existsSync(target)) throw new Error(`Redirect target is not a page of the export: ${from} -> ${to}`);
      const file = path.join(out, `${from}.html`);
      if (existsSync(file)) throw new Error(`Redirect source is still a page of the export: ${from}. Remove the redirect or the page.`);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, stub(to));
    }
    console.log(`redirects: ${pages.length} stub pages written to out/`);
  } else {
    console.log('redirects: no out/ folder, stub pages skipped');
  }

  const vercelFile = path.join(pkg, 'vercel.json');
  const vercel = JSON.parse(await readFile(vercelFile, 'utf8')) as Record<string, unknown>;
  vercel.redirects = pages.map(([source, destination]) => ({ source, destination, permanent: true }));
  const next = `${JSON.stringify(vercel, null, 2)}\n`;
  if (next !== (await readFile(vercelFile, 'utf8'))) {
    await writeFile(vercelFile, next);
    console.log('redirects: vercel.json updated');
  }
}

await main();
