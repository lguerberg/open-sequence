import { z } from 'zod';
import type { ChannelRef } from '@opensequence/core';
import type { ConnectionSecretSource } from '../credentials.js';

/** One mail server the sender's mailbox is reached through: SMTP to send, IMAP to read. */
export const mailServerSchema = z.object({
  host: z.string().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  /** TLS from the first byte (465 for SMTP, 993 for IMAP); off means STARTTLS when the server offers it. */
  secure: z.boolean(),
  user: z.string().min(1).max(320),
  password: z.string().min(1).max(1024),
});
export type MailServer = z.infer<typeof mailServerSchema>;

export const smtpCredentialsSchema = z.object({ smtp: mailServerSchema, imap: mailServerSchema });
export type SmtpCredentials = z.infer<typeof smtpCredentialsSchema>;

/** The non-secret half of the credentials, as the connection row's `config` stores it and the API returns it. */
export function splitSmtpCredentials(creds: SmtpCredentials): {
  config: Record<string, unknown>;
  secrets: Record<string, string>;
} {
  const { password: smtpPassword, ...smtp } = creds.smtp;
  const { password: imapPassword, ...imap } = creds.imap;
  return {
    config: { smtp, imap },
    secrets: { smtp_password: smtpPassword, imap_password: imapPassword },
  };
}

/** The inverse of `splitSmtpCredentials`, from what the secret source returns for a connection. */
export function joinSmtpCredentials(
  config: Record<string, unknown>,
  secrets: Record<string, string>
): SmtpCredentials {
  const smtp = typeof config['smtp'] === 'object' && config['smtp'] !== null ? config['smtp'] : {};
  const imap = typeof config['imap'] === 'object' && config['imap'] !== null ? config['imap'] : {};
  const parsed = smtpCredentialsSchema.safeParse({
    smtp: { ...smtp, password: secrets['smtp_password'] },
    imap: { ...imap, password: secrets['imap_password'] },
  });
  if (!parsed.success)
    throw new SmtpError(
      'credentials_needed: the stored SMTP/IMAP settings are incomplete; set the email channel again',
      'CREDENTIALS_INVALID'
    );
  return parsed.data;
}

/** The decrypted settings of the channel's connection; throws `credentials_needed` when the channel has none. */
export async function smtpCredentialsFor(
  source: ConnectionSecretSource,
  channel: ChannelRef
): Promise<SmtpCredentials> {
  if (!channel.connectionId)
    throw new SmtpError(
      `credentials_needed: channel ${channel.channelId} has no SMTP connection`,
      'CREDENTIALS_MISSING'
    );
  const c = await source.connectionSecrets(channel.connectionId);
  return joinSmtpCredentials(c.config, c.secrets);
}

export class SmtpError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = 'SmtpError';
  }
}
