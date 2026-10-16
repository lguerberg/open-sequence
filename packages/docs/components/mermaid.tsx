'use client';
import { useEffect, useId, useState } from 'react';

/**
 * A Mermaid diagram, rendered in the browser (the site is a static export). A ```mermaid fence in
 * MDX becomes this component (source.config.ts). It follows the site theme: the brand palette in
 * light mode, the same hues on a dark surface in dark mode, and re-renders when the theme changes.
 */

const light = {
  background: '#ffffff',
  primaryColor: '#f3f8fd',
  primaryBorderColor: '#74acdf',
  primaryTextColor: '#0f1b2a',
  secondaryColor: '#e6f0fa',
  tertiaryColor: '#ffffff',
  lineColor: '#2b7bc0',
  textColor: '#0f1b2a',
  clusterBkg: '#f8fbfe',
  clusterBorder: '#c9def2',
  edgeLabelBackground: '#ffffff',
  noteBkgColor: '#fff8e1',
  noteTextColor: '#0f1b2a',
};

const dark = {
  background: '#0b1420',
  primaryColor: '#13243a',
  primaryBorderColor: '#4a8fd0',
  primaryTextColor: '#e6eef7',
  secondaryColor: '#18304d',
  tertiaryColor: '#0b1420',
  lineColor: '#74acdf',
  textColor: '#e6eef7',
  clusterBkg: '#0f1d2f',
  clusterBorder: '#26425f',
  edgeLabelBackground: '#0b1420',
  noteBkgColor: '#2a2410',
  noteTextColor: '#e6eef7',
};

function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const isDark = useIsDark();
  const [svg, setSvg] = useState<string>();
  const [minWidth, setMinWidth] = useState<number>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          fontFamily: 'inherit',
          theme: 'base',
          themeVariables: { ...(isDark ? dark : light), fontSize: '14px' },
          flowchart: { curve: 'basis', padding: 12 },
        });
        const { svg } = await mermaid.render(`mermaid-${id}-${isDark ? 'd' : 'l'}`, chart);
        if (!cancelled) {
          // Keep text legible on a phone: never shrink a wide diagram below 640px (or its own
          // width); the frame scrolls sideways instead.
          const natural = Number(/max-width:\s*([\d.]+)px/.exec(svg)?.[1] ?? 0);
          setMinWidth(natural ? Math.min(natural, 640) : undefined);
          setSvg(svg);
          setError(undefined);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id, isDark]);

  if (error) {
    return (
      <pre className="my-6 overflow-x-auto rounded-xl border border-fd-border bg-fd-card p-4 text-xs">
        {chart}
      </pre>
    );
  }
  return (
    <figure className="not-prose my-6 overflow-x-auto rounded-xl border border-fd-border bg-fd-card p-4">
      {svg ? (
        <div className="flex justify-center [&_svg]:h-auto [&_svg]:max-w-full" style={{ minWidth }} dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="h-40 animate-pulse rounded-lg bg-fd-muted" aria-label="Loading diagram" />
      )}
    </figure>
  );
}
