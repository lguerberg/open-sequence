import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  // Static export: the site is plain files on Vercel, Cloudflare Pages or any CDN.
  output: 'export',
  reactStrictMode: true,
  // Pages that moved keep their old URL: lib/redirects.ts, written into out/ and vercel.json by
  // scripts/redirects.ts after the build (a static export cannot answer a 301 itself).
};

export default withMDX(config);
