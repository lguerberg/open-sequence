import { ImageResponse } from 'next/og';

export const dynamic = 'force-static';
export const alt =
  'OpenSequence: sales sequences, as code. Open source, self-hosted outbound infrastructure.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** The share card, in the landing's register: white ground, navy headline, the celeste band. */
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#ffffff',
        color: '#0f1b2a',
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
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 11,
            background: '#74acdf',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path
              d="M5.5 12h3.4l2.1-4.8 2.3 9.6 2.1-4.8h3.1"
              stroke="#0f1b2a"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
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
          background: '#74acdf',
          color: '#0f1b2a',
          borderRadius: 28,
          padding: '26px 34px',
          fontSize: 28,
          letterSpacing: -0.8,
        }}
      >
        <span>No per-seat pricing. No black boxes.</span>
        <span style={{ fontFamily: 'monospace', fontSize: 22, letterSpacing: 0 }}>
          opensequence.dev · Apache-2.0
        </span>
      </div>
    </div>,
    { ...size }
  );
}
