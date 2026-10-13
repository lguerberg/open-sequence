import type { Metadata, Viewport } from 'next';
import { themeInit, uiBehaviour } from '@/lib/scripts';
import { mono, sans } from './fonts';
import './globals.css';

const title = 'OpenSequence: open source sales sequencing, self-hosted';
const description =
  "The open source alternative to Apollo, Lemlist and Outreach sequences. Self-host multi-step email, SMS and call sequences for any CRM, sent from your reps' own Gmail and phone, configured through an API or MCP. No per-seat price.";

export const metadata: Metadata = {
  metadataBase: new URL('https://opensequence.dev'),
  title: { default: title, template: '%s · OpenSequence' },
  description,
  applicationName: 'OpenSequence',
  keywords: [
    'open source sales sequences',
    'self-hosted sales engagement',
    'Apollo alternative',
    'Lemlist alternative',
    'Outreach alternative',
    'Salesloft alternative',
    'email sequences API',
    'sales sequencing API',
    'cold email sequences open source',
    'sales cadence software',
    'Gmail outreach sequences',
    'MCP server sales outreach',
  ],
  alternates: { canonical: '/' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  openGraph: {
    title: 'Sales sequences, as code. OpenSequence is open source.',
    description:
      'Build your own sales sequencing infrastructure without building it from scratch. An open-source, self-hosted engine for orchestrating outbound across email, APIs, and AI agents. No per-seat pricing.',
    url: 'https://opensequence.dev',
    siteName: 'OpenSequence',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sales sequences, as code. OpenSequence is open source.',
    description:
      'An open-source, self-hosted engine for orchestrating outbound across email, APIs, and AI agents. No per-seat pricing. No black boxes.',
  },
  icons: { icon: '/favicon.svg' },
  category: 'technology',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0c' },
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script id="oseq-theme-init" dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <div
          id="oseq"
          className={`${sans.variable} ${mono.variable} min-h-dvh bg-background font-sans text-[16px] leading-normal text-foreground`}
        >
          {children}
        </div>
        <script id="oseq-ui" dangerouslySetInnerHTML={{ __html: uiBehaviour }} />
      </body>
    </html>
  );
}
