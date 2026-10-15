import { ImageResponse } from 'next/og';
import { brand, markPath } from './shared';

/** The mark as an SVG element, for the Open Graph cards and the apple touch icon. */
export function Mark({ size, rounded = true }: { size: number; rounded?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {rounded ? <rect x="1" y="1" width="22" height="22" rx="6" fill={brand.celeste} /> : <rect x="0" y="0" width="24" height="24" fill={brand.celeste} />}
      <path d={markPath} stroke={brand.navy} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The 1200x630 link preview card: white, a celeste band on top, the mark and "OpenSequence docs",
 * the section, the page title in navy and its description. Rendered once per page at build time.
 */
export function ogImage(input: { title: string; description?: string; section?: string; method?: string }) {
  const title = input.title.length > 90 ? `${input.title.slice(0, 87)}...` : input.title;
  const description = input.description && input.description.length > 160 ? `${input.description.slice(0, 157)}...` : input.description;
  const titleSize = title.length > 60 ? 56 : title.length > 36 ? 66 : 76;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: brand.white, color: brand.navy }}>
        <div style={{ display: 'flex', height: 18, width: '100%', background: brand.celeste }} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '56px 72px 52px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <Mark size={56} />
            <div style={{ display: 'flex', fontSize: 34, letterSpacing: -0.5 }}>OpenSequence</div>
            <div style={{ display: 'flex', fontSize: 34, color: brand.muted }}>docs</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 22 }}>
            {input.section || input.method ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 26, color: brand.muted }}>
                {input.method ? (
                  <div style={{ display: 'flex', padding: '4px 14px', borderRadius: 8, background: brand.celeste, color: brand.navy, fontSize: 24 }}>
                    {input.method}
                  </div>
                ) : null}
                {input.section ? <div style={{ display: 'flex' }}>{input.section}</div> : null}
              </div>
            ) : null}
            <div style={{ display: 'flex', fontSize: titleSize, lineHeight: 1.1, letterSpacing: -1.5 }}>{title}</div>
            {description ? <div style={{ display: 'flex', fontSize: 28, lineHeight: 1.4, color: brand.muted }}>{description}</div> : null}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24, color: brand.muted }}>
            <div style={{ display: 'flex' }}>docs.opensequence.dev</div>
            <div style={{ display: 'flex' }}>Open source, self-hosted sales sequences</div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
