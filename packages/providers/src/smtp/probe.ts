/**
 * Proves a mailbox's settings work before they are stored, and again at health time: one SMTP
 * `verify` (connect, STARTTLS when offered, AUTH) and one IMAP login. Each failure is classed as
 * a wrong password, an unreachable server or something else the server refused, with the
 * server's own sentence, so the API can say what to fix. Passwords never appear in a result.
 */
import { AuthenticationFailure, ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import type { MailServer, SmtpCredentials } from './credentials.js';
import { DEFAULT_TIMEOUT_MS, type SmtpProviderOptions } from './options.js';

export type SmtpProbeCode =
  | 'SMTP_AUTH_FAILED'
  | 'SMTP_UNREACHABLE'
  | 'SMTP_REFUSED'
  | 'IMAP_AUTH_FAILED'
  | 'IMAP_UNREACHABLE'
  | 'IMAP_REFUSED';

export interface SmtpProbeResult {
  ok: boolean;
  code?: SmtpProbeCode;
  error?: string;
}

const NETWORK_CODES = new Set([
  'ECONNECTION',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ETIMEOUT',
  'ESOCKET',
  'EDNS',
  'CONNECT_TIMEOUT',
  'GREETING_TIMEOUT',
  'UPGRADE_TIMEOUT',
  'EPROTO',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_HAS_EXPIRED',
]);

export function isNetworkError(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  return typeof code === 'string' && NETWORK_CODES.has(code);
}

/** Loopback is the only place a password may travel without TLS (a local Proton Bridge, a test server). */
export function isLoopback(host: string): boolean {
  return host === 'localhost' || host === '::1' || host === '[::1]' || /^127\./.test(host);
}

export function smtpTransport(server: MailServer, opts: SmtpProviderOptions = {}) {
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return nodemailer.createTransport({
    host: server.host,
    port: server.port,
    secure: server.secure,
    // Without implicit TLS, insist on STARTTLS: the password never crosses the network in clear.
    requireTLS: !server.secure && !isLoopback(server.host),
    auth: { user: server.user, pass: server.password },
    connectionTimeout: timeout,
    greetingTimeout: timeout,
    socketTimeout: timeout,
    logger: false,
    tls: opts.tls,
  });
}

export function imapClient(
  server: MailServer,
  opts: SmtpProviderOptions = {},
  extra: { verifyOnly?: boolean } = {}
): ImapFlow {
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new ImapFlow({
    host: server.host,
    port: server.port,
    secure: server.secure,
    auth: { user: server.user, pass: server.password },
    connectionTimeout: timeout,
    greetingTimeout: timeout,
    socketTimeout: timeout,
    disableAutoIdle: true,
    ...(!server.secure && !isLoopback(server.host) ? { doSTARTTLS: true } : {}),
    logger: false,
    tls: opts.tls,
    ...(extra.verifyOnly ? { verifyOnly: true } : {}),
  });
}

/** Opens an IMAP session, runs `fn`, and logs out whatever happens: one short-lived connection per call. */
export async function withImap<T>(
  server: MailServer,
  opts: SmtpProviderOptions,
  fn: (client: ImapFlow) => Promise<T>
): Promise<T> {
  const client = imapClient(server, opts);
  // ImapFlow reports connection-level failures as events; a listener keeps them from becoming unhandled.
  client.on('error', () => {});
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

export async function probeSmtp(
  server: MailServer,
  opts: SmtpProviderOptions = {}
): Promise<SmtpProbeResult> {
  const transport = smtpTransport(server, opts);
  try {
    await transport.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, ...classify(err, 'SMTP') };
  } finally {
    transport.close();
  }
}

export async function probeImap(
  server: MailServer,
  opts: SmtpProviderOptions = {}
): Promise<SmtpProbeResult> {
  const client = imapClient(server, opts, { verifyOnly: true });
  client.on('error', () => {});
  try {
    await client.connect();
    return { ok: true };
  } catch (err) {
    return { ok: false, ...classify(err, 'IMAP') };
  } finally {
    client.close();
  }
}

/** SMTP first, then IMAP; the first failure is the answer. */
export async function probeSmtpImap(
  creds: SmtpCredentials,
  opts: SmtpProviderOptions = {}
): Promise<SmtpProbeResult> {
  const smtp = await probeSmtp(creds.smtp, opts);
  if (!smtp.ok) return smtp;
  return probeImap(creds.imap, opts);
}

export function isAuthError(err: unknown): boolean {
  if (err instanceof AuthenticationFailure) return true;
  const e = err as { code?: unknown; responseCode?: unknown; authenticationFailed?: unknown };
  if (e?.authenticationFailed === true || e?.code === 'EAUTH') return true;
  return (
    typeof e?.responseCode === 'number' &&
    (e.responseCode === 535 || e.responseCode === 534 || e.responseCode === 530)
  );
}

function classify(err: unknown, side: 'SMTP' | 'IMAP'): { code: SmtpProbeCode; error: string } {
  const text = errorText(err);
  if (isAuthError(err))
    return { code: `${side}_AUTH_FAILED`, error: `${side} login was refused: ${text}` };
  if (isNetworkError(err))
    return { code: `${side}_UNREACHABLE`, error: `could not reach the ${side} server: ${text}` };
  return { code: `${side}_REFUSED`, error: `the ${side} server refused: ${text}` };
}

/** The server's sentence, without anything that could be a password. */
export function errorText(err: unknown): string {
  const e = err as {
    response?: unknown;
    responseText?: unknown;
    message?: unknown;
    code?: unknown;
  };
  const text =
    [e?.responseText, e?.response, e?.message].find(
      (v): v is string => typeof v === 'string' && v.length > 0
    ) ?? String(err);
  return text.replace(/\s+/g, ' ').slice(0, 300);
}
