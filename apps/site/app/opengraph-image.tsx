import { ImageResponse } from 'next/og';

export const dynamic = 'force-static';
export const alt = 'OpenSequence: sales sequences, as code. Open source, self-hosted outbound infrastructure.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** The share card, in the design system's dark theme: ink ground, hairline frame, one azure mark. */
export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#0b0b0c', color: '#f4f4f5', fontFamily: 'sans-serif', padding: 40 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid #242427', padding: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 30 }}>
            <div style={{ width: 38, height: 38, borderRadius: 9, background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path d="M5.5 12h3.4l2.1-4.8 2.3 9.6 2.1-4.8h3.1" stroke="#0b0b0c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span>opensequence</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
            <div style={{ fontSize: 82, fontWeight: 400, letterSpacing: -3.5, lineHeight: 1 }}>Sales sequences, as code.</div>
            <div style={{ fontSize: 30, color: '#a1a1aa', lineHeight: 1.35, maxWidth: 960 }}>
              An open-source, self-hosted engine for orchestrating outbound across email, APIs, and AI agents.
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 22, color: '#71717a', fontFamily: 'monospace' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: '#5cb6f2' }} />
              opensequence.dev
            </span>
            <span>APACHE-2.0 · NO PER-SEAT PRICING</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
