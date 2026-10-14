import { Geist, Instrument_Serif, JetBrains_Mono } from 'next/font/google';

/** Self-hosted at build time by next/font: no request to Google at runtime. */
export const display = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-display-face',
  display: 'swap',
});
export const sans = Geist({ subsets: ['latin'], variable: '--font-sans-face', display: 'swap' });
export const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-face',
  display: 'swap',
});
