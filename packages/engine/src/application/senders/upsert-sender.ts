import type { Sender } from '../../domain/entities.js';
import { invalid } from '../../domain/shared/errors.js';
import type { Deps } from '../deps.js';
import { zodProblems } from '../projects/shared.js';
import { senderInputSchema, type SenderInput } from './shared.js';
import { sanitizeSignature, signatureText } from './signature.js';

export async function upsertSender(deps: Deps, projectId: string, externalId: string, input: SenderInput): Promise<Sender> {
  const parsed = senderInputSchema.safeParse(input);
  if (!parsed.success) throw invalid('INVALID_SENDER', zodProblems(parsed.error));
  const d = parsed.data;
  // An omitted signature keeps the stored one; null clears it; a string replaces it, sanitized.
  const html = d.signature_html === undefined ? undefined : d.signature_html === null ? null : sanitizeSignature(d.signature_html);
  const text = d.signature_text === undefined ? undefined : d.signature_text === null ? null : d.signature_text.trim();
  return deps.uow.transaction(async ({ repos }) => {
    const existing = await repos.senders.byExternalId(projectId, externalId);
    const signatureHtml = html === undefined ? (existing?.signatureHtml ?? null) : html;
    const signatureText = text !== undefined ? text : html !== undefined ? (html ? signatureTextOf(html) : null) : (existing?.signatureText ?? null);
    return repos.senders.upsertByExternalId({
      id: existing?.id ?? deps.ids.next('sender'),
      projectId,
      externalId,
      name: d.name,
      email: d.email ?? null,
      timezone: d.timezone,
      status: existing?.status ?? 'active',
      attrs: d.attrs,
      signatureHtml,
      signatureText,
    });
  });
}

function signatureTextOf(html: string): string | null {
  const t = signatureText(html);
  return t.length ? t : null;
}
