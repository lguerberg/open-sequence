import { Albert_Sans, IBM_Plex_Mono } from 'next/font/google';

/** Self-hosted at build time by next/font: no request to Google at runtime. */
export const sans = Albert_Sans({ subsets: ['latin'], variable: '--font-albert', display: 'swap' });
export const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono', display: 'swap' });
