/** A text and SVG logo; swap for the real mark in public/ when there is one. */
export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 font-semibold">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" className="shrink-0">
        <rect x="1" y="1" width="20" height="20" rx="5" className="fill-fd-primary" />
        <circle cx="6.5" cy="11" r="2" className="fill-fd-primary-foreground" />
        <circle cx="15.5" cy="11" r="2" className="fill-fd-primary-foreground" />
        <path d="M8.5 11h5" className="stroke-fd-primary-foreground" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      OpenSequence
    </span>
  );
}
