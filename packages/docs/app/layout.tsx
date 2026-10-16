import type { Metadata, Viewport } from 'next';
import { Geist, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { Provider } from '@/components/provider';
import { socialMetadata } from '@/lib/seo';
import { getPageImage, projectUrl, siteDescription, siteName, siteTitle, siteUrl } from '@/lib/shared';
import './global.css';

/** The landing's type: Geist for reading, JetBrains Mono for code, Instrument Serif for the home title. */
const sans = Geist({ subsets: ['latin'], variable: '--font-sans-face', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono-face', display: 'swap' });
const display = Instrument_Serif({ subsets: ['latin'], weight: '400', variable: '--font-display-face', display: 'swap' });

/**
 * The defaults every page inherits. Each docs page sets its own title, description, canonical URL
 * and Open Graph card in app/[...slug]/page.tsx; `metadataBase` makes their relative URLs absolute.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: siteTitle, template: `%s · ${siteTitle}` },
  description: siteDescription,
  applicationName: siteTitle,
  authors: [{ name: siteName, url: projectUrl }],
  creator: siteName,
  publisher: siteName,
  keywords: [
    'OpenSequence',
    'sales sequences API',
    'self-hosted sales engagement',
    'open source sales sequencing',
    'outreach sequences',
    'email sequences API',
    'SMS sequences',
    'CRM sequences',
    'sales cadence',
    'webhooks',
    'TypeScript SDK',
    'documentation',
  ],
  category: 'technology',
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
  ...socialMetadata({ title: siteTitle, description: siteDescription, url: '/', image: getPageImage([]).url }),
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a1320' },
  ],
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable} font-sans`} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
