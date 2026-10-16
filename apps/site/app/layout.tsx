import type { Metadata, Viewport } from 'next';
import { uiBehaviour } from '@/lib/scripts';
import {
  SHARE_ALT,
  SHARE_DESCRIPTION,
  SHARE_TITLE,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from '@/lib/site';
import { mono, sans } from './fonts';
import './globals.css';

const title = 'OpenSequence: open source sales sequencing, self-hosted';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: title, template: '%s · OpenSequence' },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: 'OpenSequence', url: SITE_URL }],
  creator: 'OpenSequence',
  publisher: 'OpenSequence',
  keywords: [
    'open source sales sequences',
    'self-hosted sales engagement',
    'Outreach alternative',
    'Salesloft alternative',
    'Apollo alternative',
    'lemlist alternative',
    'Customer.io alternative',
    'sales sequencing API',
    'email sequences API',
    'cold email sequences open source',
    'sales cadence software',
    'MCP server for sales outreach',
  ],
  alternates: { canonical: '/' },
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
