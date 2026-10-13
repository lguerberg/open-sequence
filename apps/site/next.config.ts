import type { NextConfig } from 'next';

// A static site: `next build` writes out/, which any static host serves. No server, no image optimizer.
const nextConfig: NextConfig = {
  output: 'export',
  // Set SITE_ASSET_PREFIX (e.g. "./") to build a preview that is served from a sub-path.
  ...(process.env.SITE_ASSET_PREFIX ? { assetPrefix: process.env.SITE_ASSET_PREFIX } : {}),
  trailingSlash: false,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
