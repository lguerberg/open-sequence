import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  // Static export: the site is plain files on Vercel, Cloudflare Pages or any CDN.
  output: 'export',
  reactStrictMode: true,
  // Pages that moved keep their old URL (section 19.4). Add a line here when a page moves.
  // Note: `redirects` are not applied by a static export; the list is kept for a hosted deploy
  // and for the hosting platform's own redirect rules.
};

export default withMDX(config);
