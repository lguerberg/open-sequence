import { brand, markPath } from '@/lib/shared';

/** The OpenSequence mark (celeste tile, navy pulse, the same as on opensequence.dev and the favicon) and the name. */
export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 font-semibold">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
        <rect x="1" y="1" width="22" height="22" rx="6" fill={brand.celeste} />
        <path d={markPath} stroke={brand.navy} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      OpenSequence
    </span>
  );
}
