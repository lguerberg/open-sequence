import { ImageResponse } from 'next/og';

/**
 * The brand images, drawn with next/og at build time. Each is served from a route whose path ends in
 * .png, so the static host sends image/png (a metadata route named opengraph-image has no extension
 * and some hosts serve it as application/octet-stream, which share crawlers reject).
 */

const NAVY = '#0f1b2a';
const CELESTE = '#74acdf';

function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="1" y="1" width="22" height="22" rx="6" fill={CELESTE} />
      <path
        d="M5.5 12h3.4l2.1-4.8 2.3 9.6 2.1-4.8h3.1"
        stroke={NAVY}
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The square app icon: the mark on white, with a little air for maskable launchers. */
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
      <Mark size={Math.round(size * 0.78)} />
    </div>,
    { width: size, height: size }
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
        fontFamily: 'sans-serif',
        padding: 56,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          fontSize: 32,
          letterSpacing: -1.2,
        }}
      >
        <Mark size={44} />
        <span>opensequence</span>
      </div>
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
    { width: 1200, height: 630 }
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
        fontFamily: 'sans-serif',
        padding: 56,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 32,
          letterSpacing: -1.2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Mark size={44} />
          <span>opensequence</span>
        </div>
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 20,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: '#2b7bc0',
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
    { width: 1200, height: 630 }
  );
}
