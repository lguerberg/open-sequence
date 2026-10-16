import { markPaths } from '@/lib/shared';

/**
 * The OpenSequence logo, the same as on opensequence.dev: the mark (a sequence in code braces, forking
 * on a reply) and the two-tone wordmark. In dark mode the tile turns navy and the ink white.
 */
export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-[17px] font-semibold tracking-[-0.035em]">
      <svg width="26" height="26" viewBox="0 0 64 64" fill="none" aria-hidden="true" className="shrink-0">
        <rect
          x="0.75"
          y="0.75"
          width="62.5"
          height="62.5"
          rx="15.5"
          strokeWidth="1.5"
          className="fill-white stroke-[#dbe6f1] dark:fill-[#1c2c40] dark:stroke-[#1c2c40]"
        />
        <g strokeLinecap="round" strokeLinejoin="round" className="stroke-[#0f1b2a] dark:stroke-white">
          {markPaths.braces.map((d) => (
            <path key={d} d={d} strokeWidth="3.5" />
          ))}
          <path d={markPaths.fork} strokeWidth="2.5" />
        </g>
        <path d={markPaths.reply} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-[#2b7bc0] dark:stroke-[#74acdf]" />
        <circle cx="22" cy="32" r="3.4" className="fill-[#0f1b2a] dark:fill-white" />
        <circle cx="41.5" cy="25" r="3.4" className="fill-[#0f1b2a] dark:fill-white" />
        <circle cx="41.5" cy="39" r="3.6" className="fill-[#2b7bc0] dark:fill-[#74acdf]" />
      </svg>
      <span>
        <span className="text-[#0f1b2a] dark:text-white">open</span>
        <span className="text-[#2b7bc0] dark:text-[#a9cff0]">sequence</span>
      </span>
    </span>
  );
}
