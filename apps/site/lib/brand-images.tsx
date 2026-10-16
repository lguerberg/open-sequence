import fs from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';

/**
 * The brand images, drawn with next/og at build time. Each is served from a route whose path ends in
 * .png, so the static host sends image/png (a metadata route named opengraph-image has no extension
 * and some hosts serve it as application/octet-stream, which share crawlers reject).
 */

const NAVY = '#0f1b2a';
const BLUE = '#2b7bc0';
const CELESTE = '#74acdf';

/** Geist, the site's type, for the wordmark and the headlines (next/og bundles only the regular weight). */
const fontDir = path.join(process.cwd(), 'lib/fonts');
const fonts = [
  { name: 'Geist', data: fs.readFileSync(path.join(fontDir, 'Geist-Regular.ttf')), weight: 400 as const, style: 'normal' as const },
  { name: 'Geist', data: fs.readFileSync(path.join(fontDir, 'Geist-SemiBold.ttf')), weight: 600 as const, style: 'normal' as const },
];

/**
 * The mark: a sequence in code braces, one step forking on a reply, on a 64 by 64 grid (the same as
 * components/ds/brand.tsx). `tile="square"` drops the rounded tile and its hairline for a full-bleed
 * white square, for the app icons, where the launcher applies its own mask.
 */
function Mark({ size, tile = 'rounded' }: { size: number; tile?: 'rounded' | 'square' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      {tile === 'rounded' ? (
        <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="15.5" fill="#ffffff" stroke="#dbe6f1" strokeWidth="1.5" />
      ) : (
        <rect width="64" height="64" fill="#ffffff" />
      )}
      <path d="M19 13C14 13 13 16 13 21v6c0 3-2 5-5 5 3 0 5 2 5 5v6c0 5 1 8 6 8" stroke={NAVY} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M45 13c5 0 6 3 6 8v6c0 3 2 5 5 5-3 0-5 2-5 5v6c0 5-1 8-6 8" stroke={NAVY} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 32h5c5 0 5-7 10-7h4" stroke={NAVY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M27 32c5 0 5 7 10 7h4" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22" cy="32" r="3.4" fill={NAVY} />
      <circle cx="41.5" cy="25" r="3.4" fill={NAVY} />
      <circle cx="41.5" cy="39" r="3.6" fill={BLUE} />
    </svg>
  );
}

/** The lockup: the mark and the two-tone wordmark, "open" in navy and "sequence" in brand blue. */
function Lockup({ size }: { size: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(size * 0.42) }}>
      <Mark size={Math.round(size * 1.65)} />
      <div style={{ display: 'flex', fontSize: size, fontWeight: 600, letterSpacing: -size * 0.035 }}>
        {/* satori leaves a gap between two text runs; the margin closes it to plain letter spacing */}
        <span style={{ color: NAVY, marginRight: -size * 0.14 }}>open</span>
        <span style={{ color: BLUE }}>sequence</span>
      </div>
    </div>
  );
}

/** The square app icon: the mark on white, with a little air so the braces survive a maskable launcher's circle. */
export function iconPng(size: number) {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#ffffff',
      }}
    >
      <Mark size={Math.round(size * 0.9)} tile="square" />
    </div>,
    { width: size, height: size, fonts }
  );
}

/** The 1200 by 630 share card: white ground, navy headline, the celeste band with the saving. */
export function ogPng() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#ffffff',
        color: NAVY,
        fontFamily: 'Geist',
        padding: 56,
      }}
    >
      <Lockup size={34} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ fontSize: 96, fontWeight: 500, letterSpacing: -4.5, lineHeight: 0.95 }}>
          Sales sequences, as code.
        </div>
        <div
          style={{
            fontSize: 34,
            color: '#3c4a5c',
            letterSpacing: -1.2,
            lineHeight: 1.1,
            maxWidth: 900,
          }}
        >
          Own your sales sequencing infrastructure without building it from scratch.
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: CELESTE,
          color: NAVY,
          borderRadius: 28,
          padding: '26px 34px',
          fontSize: 28,
          letterSpacing: -0.8,
        }}
      >
        <span>Save $2,000+ a month on your sequencing tool.</span>
        <span style={{ fontFamily: 'monospace', fontSize: 22, letterSpacing: 0 }}>
          opensequence.dev · Apache-2.0
        </span>
      </div>
    </div>,
    { width: 1200, height: 630, fonts }
  );
}

/**
 * The blog share card: the same white ground and celeste band, with the post title as the headline.
 * The type steps down for long titles so every title up to 60 characters fits on three lines.
 */
export function postOgPng({ title, eyebrow }: { title: string; eyebrow: string }) {
  const size = title.length <= 28 ? 96 : title.length <= 44 ? 80 : 68;
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#ffffff',
        color: NAVY,
        fontFamily: 'Geist',
        padding: 56,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Lockup size={34} />
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 20,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: BLUE,
          }}
        >
          {eyebrow}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: size,
          fontWeight: 500,
          letterSpacing: -size * 0.045,
          lineHeight: 1.02,
          maxWidth: 1060,
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: CELESTE,
          color: NAVY,
          borderRadius: 28,
          padding: '26px 34px',
          fontSize: 28,
          letterSpacing: -0.8,
        }}
      >
        <span>Open source sales sequencing, self-hosted.</span>
        <span style={{ fontFamily: 'monospace', fontSize: 22, letterSpacing: 0 }}>
          opensequence.dev/blog
        </span>
      </div>
    </div>,
    { width: 1200, height: 630, fonts }
  );
}
