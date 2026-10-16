import fs from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { brand, markPaths } from './shared';

/** Geist, the docs' type, for the wordmark and the titles (next/og bundles only the regular weight). */
const fontDir = path.join(process.cwd(), 'lib/fonts');
const fonts = [
  { name: 'Geist', data: fs.readFileSync(path.join(fontDir, 'Geist-Regular.ttf')), weight: 400 as const, style: 'normal' as const },
  { name: 'Geist', data: fs.readFileSync(path.join(fontDir, 'Geist-SemiBold.ttf')), weight: 600 as const, style: 'normal' as const },
];

/**
 * The mark as an SVG element, for the Open Graph cards: white rounded tile with a hairline. `rounded={false}`
 * draws a full-bleed white square instead, for icons the platform masks itself.
 */
export function Mark({ size, rounded = true }: { size: number; rounded?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      {rounded ? (
        <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="15.5" fill={brand.white} stroke={brand.hairline} strokeWidth="1.5" />
      ) : (
        <rect width="64" height="64" fill={brand.white} />
      )}
      {markPaths.braces.map((d) => (
        <path key={d} d={d} stroke={brand.navy} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      <path d={markPaths.fork} stroke={brand.navy} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d={markPaths.reply} stroke={brand.blue} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22" cy="32" r="3.4" fill={brand.navy} />
      <circle cx="41.5" cy="25" r="3.4" fill={brand.navy} />
      <circle cx="41.5" cy="39" r="3.6" fill={brand.blue} />
    </svg>
  );
}

/**
 * The 1200x630 link preview card: white, a celeste band on top, the logo and "docs",
 * the section, the page title in navy and its description. Rendered once per page at build time.
 */
export function ogImage(input: { title: string; description?: string; section?: string; method?: string }) {
  const title = input.title.length > 90 ? `${input.title.slice(0, 87)}...` : input.title;
  const description = input.description && input.description.length > 160 ? `${input.description.slice(0, 157)}...` : input.description;
  const titleSize = title.length > 60 ? 56 : title.length > 36 ? 66 : 76;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: brand.white, color: brand.navy, fontFamily: 'Geist' }}>
        <div style={{ display: 'flex', height: 18, width: '100%', background: brand.celeste }} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '56px 72px 52px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Mark size={56} />
            <div style={{ display: 'flex', fontSize: 34, fontWeight: 600, letterSpacing: -1.2 }}>
              {/* satori leaves a gap between two text runs; the margin closes it to plain letter spacing */}
              <span style={{ color: brand.navy, marginRight: -4.8 }}>open</span>
              <span style={{ color: brand.blue }}>sequence</span>
            </div>
            <div style={{ display: 'flex', fontSize: 34, color: brand.muted, marginLeft: 4 }}>docs</div>
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
    { width: 1200, height: 630, fonts },
  );
}
