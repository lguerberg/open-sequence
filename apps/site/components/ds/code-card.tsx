import { codeToHtml } from 'shiki';
import { cn } from '@/lib/utils';

export type CodeLang = 'typescript' | 'json' | 'bash' | 'text';

/** Highlights at build time with a light and a dark theme; CSS shows the one that matches the page. */
export async function highlight(code: string, lang: CodeLang): Promise<string> {
  return codeToHtml(code.trim(), { lang, themes: { light: 'vitesse-light', dark: 'vitesse-dark' }, defaultColor: false });
}

/** Just the highlighted code, no chrome. */
export async function Code({ code, lang, className }: { code: string; lang: CodeLang; className?: string }) {
  const html = await highlight(code, lang);
  return <div className={cn('bg-code', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** The square code card: a file tab, the code, an optional footer row. */
export async function CodeCard({ file, meta, code, lang, footer, className }: { file: string; meta?: string; code: string; lang: CodeLang; footer?: React.ReactNode; className?: string }) {
  return (
    <figure className={cn('m-0 min-w-0 border border-border bg-code', className)}>
      <figcaption className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-2.5 text-[13px]">
        <span className="font-mono text-foreground">{file}</span>
        {meta ? <span className="truncate font-mono text-[12px] text-subtle-foreground">{meta}</span> : null}
      </figcaption>
      <Code code={code} lang={lang} />
      {footer ? <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-surface px-4 py-2.5 text-[12.5px] text-muted-foreground">{footer}</div> : null}
    </figure>
  );
}
