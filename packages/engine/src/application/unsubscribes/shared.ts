import type { Contact } from '../../domain/entities.js';
import type { Repositories } from '../../domain/repositories.js';
import type { Deps, OptOutClaims } from '../deps.js';

/**
 * What an unsubscribe page needs to show: whether the link still works, whose it is (the email
 * masked, so a forwarded link does not leak the address) and whether that person already opted out.
 */
export interface UnsubscribeStatus {
  /** Signed by this server, for this project, not expired, and the contact still exists. */
  valid: boolean;
  /** Authentic but past its expiry (links last 90 days). */
  expired: boolean;
  /** Null when the token is not authentic or the contact is gone. */
  contact: { email: string | null; first_name: string | null } | null;
  /** The contact already has an email (or all-channel) suppression. */
  already_unsubscribed: boolean;
}

export interface ReadToken {
  status: UnsubscribeStatus;
  claims: OptOutClaims | null;
}

/** `dana@acme.com` → `d***@acme.com`. */
export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

export async function isEmailSuppressed(repos: Repositories, contactId: string): Promise<boolean> {
  const sup = await repos.contacts.suppressions(contactId);
  return sup.some((s) => s.channel === 'email' || s.channel === 'all');
}

/**
 * Verifies a token without applying it. `projectId` is the caller's project: a token of another
 * project reads as not valid. Omitted (the hosted page, which has no API key), any project's token is read.
 */
export async function readToken(deps: Deps, repos: Repositories, token: string, projectId?: string): Promise<ReadToken> {
  const none: ReadToken = { status: { valid: false, expired: false, contact: null, already_unsubscribed: false }, claims: null };
  const verified = deps.optOutVerify(token, deps.clock.now());
  if (!verified) return none;
  const { claims, expired } = verified;
  if (projectId && claims.projectId !== projectId) return none;
  const contact: Contact | null = await repos.contacts.byId(claims.projectId, claims.contactId);
  if (!contact) return none;
  return {
    status: { valid: !expired, expired, contact: { email: maskEmail(contact.email), first_name: contact.firstName }, already_unsubscribed: await isEmailSuppressed(repos, contact.id) },
    claims,
  };
}
