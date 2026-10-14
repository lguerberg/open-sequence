import { Check, Copy } from 'lucide-react';
import { codeToHtml } from 'shiki';
import { cn } from '@/lib/utils';

export type CodeLang = 'typescript' | 'json' | 'bash' | 'text';

/** Highlights at build time with one dark theme, for the dark code card. */
export async function highlight(code: string, lang: CodeLang): Promise<string> {
  return codeToHtml(code.trim(), { lang, theme: 'tokyo-night' });
}

/** Just the highlighted code, no chrome. */
export async function Code({
  code,
  lang,
  className,
}: {
  code: string;
  lang: CodeLang;
  className?: string;
}) {
  const html = await highlight(code, lang);
  return <div className={cn('min-w-0', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** The dark code window: a lime tag naming the file, a copy button, the code, an optional footer. */
export async function CodeWindow({
  tag,
  meta,
  code,
  lang,
  footer,
  className,
}: {
  tag: string;
  meta?: string;
  code: string;
  lang: CodeLang;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <figure
      className={cn('m-0 flex min-w-0 flex-col rounded-[20px] bg-code text-[#ecebe6]', className)}
    >
      <figcaption className="flex items-center justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
        <span className="flex min-w-0 items-center gap-3">
          <span className="truncate rounded-full bg-lime px-2 px-1.5 py-0.5 font-mono text-[12px] text-code">
            {tag}
          </span>
          {meta ? (
            <span className="hidden truncate font-mono text-[12px] text-[#8f8a81] sm:inline">
              {meta}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          data-copy={code.trim()}
          aria-label="Copy the code"
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/15 text-[#c9d0d0] transition-colors hover:bg-white/10"
        >
          <Copy className="copy-idle size-3.5" strokeWidth={1.75} />
          <Check className="copy-done size-3.5 text-lime" strokeWidth={2} />
        </button>
      </figcaption>
      <Code code={code} lang={lang} className="flex-1 px-5 py-5 sm:px-6 sm:py-6" />
      {footer ? <div className="px-5 pb-5 sm:px-6 sm:pb-6">{footer}</div> : null}
    </figure>
  );
}
