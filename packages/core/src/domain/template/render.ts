/**
 * Templates: `{{ path }}` and `{{ path | "fallback" }}`. Nothing else: no logic, no loops, no code.
 *
 * Paths: contact.<column>, attrs.<path> (the contact's attrs; contact.attrs.<path> is an alias),
 * sender.<column>, sender.attrs.<path>, sequence.name, unsubscribe_url.
 *
 * Rendering never throws on a missing value: it renders empty, and reports the path in `missing`
 * so the validator can refuse to publish a template that relies on a required field without a
 * fallback, and the run can record what it rendered.
 */
export interface TemplateContext {
  contact: Record<string, unknown>;
  sender: Record<string, unknown>;
  sequence: { name: string };
  unsubscribe_url?: string;
}

export interface RenderResult {
  text: string;
  /** Every path that was read and the value it resolved to. */
  used: Record<string, unknown>;
  /** Paths that resolved to nothing and had no fallback. */
  missing: string[];
}

export interface TemplateRef {
  path: string;
  fallback?: string;
}

const TOKEN = /\{\{\s*([a-zA-Z_][\w.]*)\s*(?:\|\s*"((?:[^"\\]|\\.)*)"\s*)?\}\}/g;

/** The paths a template references, for validation. */
export function templateRefs(template: string): TemplateRef[] {
  const refs: TemplateRef[] = [];
  for (const m of template.matchAll(TOKEN)) {
    const ref: TemplateRef = { path: normalizePath(m[1]!) };
    if (m[2] !== undefined) ref.fallback = unescapeString(m[2]);
    refs.push(ref);
  }
  return refs;
}

export function render(template: string, ctx: TemplateContext, opts: { html?: boolean } = {}): RenderResult {
  const used: Record<string, unknown> = {};
  const missing: string[] = [];
  const text = template.replace(TOKEN, (_whole, rawPath: string, fallback?: string) => {
    const path = normalizePath(rawPath);
    const value = resolve(path, ctx);
    used[path] = value ?? null;
    let out: string;
    if (value === undefined || value === null || value === '') {
      if (fallback !== undefined) out = unescapeString(fallback);
      else {
        missing.push(path);
        out = '';
      }
    } else {
      out = typeof value === 'string' ? value : String(value);
    }
    return opts.html ? escapeHtml(out) : out;
  });
  return { text, used, missing };
}

/** `contact.attrs.x` is accepted as an alias of `attrs.x`. */
export function normalizePath(path: string): string {
  return path.startsWith('contact.attrs.') ? `attrs.${path.slice('contact.attrs.'.length)}` : path;
}

export function isKnownRoot(path: string): boolean {
  return (
    path === 'unsubscribe_url' ||
    path === 'sequence.name' ||
    path.startsWith('contact.') ||
    path.startsWith('attrs.') ||
    path.startsWith('sender.')
  );
}

/** The contact columns that must have a fallback when used (a missing one is a publish error). */
export const REQUIRED_WITH_FALLBACK = new Set(['contact.first_name', 'contact.last_name', 'contact.email']);

function resolve(path: string, ctx: TemplateContext): unknown {
  if (path === 'unsubscribe_url') return ctx.unsubscribe_url;
  if (path === 'sequence.name') return ctx.sequence.name;
  const [root, ...rest] = path.split('.');
  if (root === 'attrs') return dig(ctx.contact['attrs'], rest);
  if (root === 'contact') return dig(ctx.contact, rest);
  if (root === 'sender') return dig(ctx.sender, rest);
  return undefined;
}

function dig(value: unknown, parts: string[]): unknown {
  let cur: unknown = value;
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function unescapeString(s: string): string {
  return s.replace(/\\(.)/g, '$1');
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
