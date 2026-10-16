import type { ConnectionSecretSource } from '../credentials.js';
import type { SmtpProviderOptions } from './options.js';
import { SmtpEmailProvider } from './smtp-email-provider.js';

export { SmtpEmailProvider, sentMailbox } from './smtp-email-provider.js';
export {
  smtpCredentialsSchema,
  mailServerSchema,
  splitSmtpCredentials,
  joinSmtpCredentials,
  SmtpError,
  type SmtpCredentials,
  type MailServer,
} from './credentials.js';
export {
  probeSmtpImap,
  probeSmtp,
  probeImap,
  type SmtpProbeResult,
  type SmtpProbeCode,
} from './probe.js';
export {
  classifyInbound,
  parseBounceSource,
  metaFromSource,
  type InboundMeta,
  type InboundScope,
} from './inbound.js';
export type { SmtpProviderOptions } from './options.js';

export function createSmtpProviders(
  secrets: ConnectionSecretSource,
  opts: SmtpProviderOptions = {}
): { email: SmtpEmailProvider } {
  return { email: new SmtpEmailProvider(secrets, opts) };
}
