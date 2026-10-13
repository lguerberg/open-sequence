#!/usr/bin/env node
/**
 * Turns a built page (out/<page>.html) into one self-contained HTML fragment for previews that
 * cannot serve /_next/ assets: stylesheets inlined, fonts inlined as data URIs, the framework
 * runtime removed. The page is designed to be complete without it; the two inline scripts
 * (theme, copy buttons) are kept.
 *
 *   node scripts/preview.mjs out index.html ../preview/landing.html [--document]
 *
 * --document writes a full HTML document (for local QA); without it, a fragment for a host page.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const [outDir, page, target, flag] = process.argv.slice(2);
if (!outDir || !page || !target) {
  console.error('usage: preview.mjs <outDir> <page.html> <target.html> [--document]');
  process.exit(2);
}

const html = readFileSync(join(outDir, page), 'utf8');

const pick = (re) => (html.match(re) || [])[1] || '';
const title = pick(/<title>([\s\S]*?)<\/title>/);
const themeInit = pick(/<script id="oseq-theme-init">([\s\S]*?)<\/script>/);
const ui = pick(/<script id="oseq-ui">([\s\S]*?)<\/script>/);

let css = '';
for (const m of html.matchAll(/<link rel="stylesheet" href="([^"]+\.css)"[^>]*>/g)) {
  const cssPath = join(outDir, m[1]);
  let text = readFileSync(cssPath, 'utf8');
  text = text.replace(/url\(([^)]+\.woff2)\)/g, (_, ref) => {
    const clean = ref.replace(/["']/g, '');
    const fontPath = clean.startsWith('/') ? join(outDir, clean) : resolve(dirname(cssPath), clean);
    return `url(data:font/woff2;base64,${readFileSync(fontPath).toString('base64')})`;
  });
  css += text + '\n';
}

let body = pick(/<body[^>]*>([\s\S]*)<\/body>/);
body = body
  .replace(/<script\b(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/g, '')
  .replace(/<link\b[^>]*>/g, '')
  .replace(/<next-route-announcer[\s\S]*?<\/next-route-announcer>/g, '');

const fragment = `<title>${title}</title>
<meta name="description" content="${pick(/<meta name="description" content="([^"]*)"/)}">
<style>${css}</style>
<script>${themeInit}</script>
${body.trim()}
<script>${ui}</script>
`;

const output =
  flag === '--document'
    ? `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px/1.4 system-ui,sans-serif;background:#f6f6f4}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${fragment}</body></html>`
    : fragment;

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, output);
console.log(`${target}: ${(output.length / 1024).toFixed(0)} KB, css ${(css.length / 1024).toFixed(0)} KB`);
