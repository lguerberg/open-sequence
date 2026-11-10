import type { Metadata, Viewport } from 'next';
import { uiBehaviour } from '@/lib/scripts';
import {
  SHARE_ALT,
  SHARE_DESCRIPTION,
  SHARE_TITLE,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from '@/lib/site';
import { mono, sans } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: '%s · OpenSequence' },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: 'OpenSequence', url: SITE_URL }],
  creator: 'OpenSequence',
  publisher: 'OpenSequence',
  keywords: [
    'open source sequences',
    'sequence engine',
    'sequence API',
    'email sequence API',
    'outreach automation API',
    'self-hosted outreach sequences',
    'multichannel sequences',
    'open source sales engagement',
    'recruiting outreach sequences',
    'customer onboarding sequences',
    'Outreach alternative',
    'Apollo alternative',
    'lemlist alternative',
    'MCP server for outreach',
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  openGraph: {
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
    url: '/',
    siteName: SITE_NAME,
    type: 'website',
    locale: 'en_US',
    images: [{ url: '/og.png', width: 1200, height: 630, type: 'image/png', alt: SHARE_ALT }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
    images: [{ url: '/og.png', alt: SHARE_ALT }],
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  category: 'technology',
};

export const viewport: Viewport = { themeColor: '#ffffff', colorScheme: 'light' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div
          id="oseq"
          className={`${sans.variable} ${mono.variable} min-h-dvh bg-background font-sans text-[16px] leading-normal text-foreground antialiased`}
        >
          {children}
        </div>
        <script id="oseq-ui" dangerouslySetInnerHTML={{ __html: uiBehaviour }} />
      </body>
    </html>
  );
}
