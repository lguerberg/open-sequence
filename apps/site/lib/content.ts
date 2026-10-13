/** All landing copy in one place. Code samples use the real @opensequence/sdk surface and node types. */

export type UseCase = { id: string; label: string; icon: string; file: string; meta: string; lang: 'typescript' | 'json' | 'text'; code: string; claim: string; href: string };

export const useCases: UseCase[] = [
  {
    id: 'create',
    label: 'Create a sequence',
    icon: 'file-plus',
    file: 'create-sequence.ts',
    meta: '@opensequence/sdk',
    lang: 'typescript',
    href: '/docs/sequences/definition',
    claim: 'A sequence is a JSON document. Create it with one call.',
    code: `import { OpenSequence } from '@opensequence/sdk';

const { SEQ_URL, SEQ_KEY } = process.env;
const oseq = new OpenSequence({ baseUrl: SEQ_URL!, apiKey: SEQ_KEY! });

const email = {
  subject: 'Hi {{ contact.first_name }}',
  body: 'Quick question…',
};

const { sequence, version } = await oseq.sequences.create({
  name: 'UK intro',
  definition: {
    entry: 'hi',
    exit_on: ['reply'],
    nodes: {
      hi: { type: 'outreach', channel: 'email', action: 'send', params: email },
    },
  },
});
await oseq.sequences.versions.publish(sequence.id, version.id);`,
  },
  {
    id: 'enroll',
    label: 'Enroll contacts',
    icon: 'user-plus',
    file: 'enroll.ts',
    meta: '@opensequence/sdk',
    lang: 'typescript',
    href: '/docs/enrollments/enrolling',
    claim: 'Enroll a contact with a sender. The engine takes it from there.',
    code: `import { OpenSequence } from '@opensequence/sdk';

const { SEQ_URL, SEQ_KEY } = process.env;
const oseq = new OpenSequence({ baseUrl: SEQ_URL!, apiKey: SEQ_KEY! });

const { items } = await oseq.sequences.list();
const ukIntro = items.find((s) => s.name === 'UK intro')!;

await oseq.senders.upsert('max', { name: 'Max Rivera', email: 'max@acme.com' });
await oseq.contacts.upsert('dana', {
  first_name: 'Dana',
  email: 'dana@example.com',
});

// First email at 09:12 Dana's time, from Max's own Gmail
await oseq.sequences.enroll(ukIntro.id, { contacts: ['dana'], sender: 'max' });`,
  },
  {
    id: 'email',
    label: 'Add an email step',
    icon: 'mail',
    file: 'add-email-step.ts',
    meta: '@opensequence/sdk',
    lang: 'typescript',
    href: '/docs/sequences/nodes',
    claim: 'Copy the live version, add a step, publish. Running enrollments keep their version.',
    code: `import { OpenSequence } from '@opensequence/sdk';

const { SEQ_URL, SEQ_KEY } = process.env;
const oseq = new OpenSequence({ baseUrl: SEQ_URL!, apiKey: SEQ_KEY! });

const { items } = await oseq.sequences.list();
const ukIntro = items.find((s) => s.name === 'UK intro')!;

// A new draft, copied from the live version
const draft = await oseq.sequences.versions.create(ukIntro.id, { tag: 'v2' });
const { definition, lockVersion } = draft;

// After the first email is sent, follow up in the same thread
const followUp = { subject: 'Re: hi', body: '…', reply_in_thread: true };
definition.nodes.hi.next = { sent: 'bump' };
definition.nodes.bump = { type: 'outreach', channel: 'email', action: 'send' };
definition.nodes.bump.params = followUp;

await oseq.sequences.versions.saveDraft(ukIntro.id, draft.id, {
  definition,
  lock_version: lockVersion,
});
await oseq.sequences.versions.publish(ukIntro.id, draft.id);`,
  },
  {
    id: 'linkedin',
    label: 'Link LinkedIn',
    icon: 'link',
    file: 'link-linkedin.ts',
    meta: '@opensequence/sdk',
    lang: 'typescript',
    href: '/docs/senders/connect-linkedin',
    claim: 'Link a rep’s LinkedIn. Each LinkedIn step becomes a task for them.',
    code: `import { OpenSequence } from '@opensequence/sdk';

const { SEQ_URL, SEQ_KEY } = process.env;
const oseq = new OpenSequence({ baseUrl: SEQ_URL!, apiKey: SEQ_KEY! });

await oseq.senders.upsert('max', { name: 'Max Rivera', email: 'max@acme.com' });
await oseq.senders.setLinkedin('max', {
  address: 'https://linkedin.com/in/max',
});

// Use it in any sequence: Max gets a task with the contact's profile to open
const linkedinStep = {
  type: 'task',
  params: { kind: 'linkedin_connect', title: 'Connect on LinkedIn', due: '1d' },
};`,
  },
  {
    id: 'gmail',
    label: 'Connect Gmail',
    icon: 'inbox',
    file: 'connect-gmail.ts',
    meta: '@opensequence/sdk',
    lang: 'typescript',
    href: '/docs/senders/connect-google',
    claim: 'Each rep connects Gmail once. Every email leaves from their inbox.',
    code: `import { OpenSequence } from '@opensequence/sdk';

const { SEQ_URL, SEQ_KEY } = process.env;
const oseq = new OpenSequence({ baseUrl: SEQ_URL!, apiKey: SEQ_KEY! });

await oseq.senders.upsert('max', { name: 'Max Rivera', email: 'max@acme.com' });

// Max opens auth_url once: Gmail send, Gmail read, Calendar read.
// Tokens renew on their own; every email leaves from max@acme.com.
const { auth_url } = await oseq.senders.connectGoogle('max');`,
  },
  {
    id: 'webhooks',
    label: 'Get webhooks',
    icon: 'webhook',
    file: 'webhooks.ts',
    meta: 'Standard Webhooks',
    lang: 'typescript',
    href: '/docs/webhooks/overview',
    claim: 'Register an endpoint once. Exits, replies and tasks arrive signed.',
    code: `import express from 'express';
import { OpenSequence, verifyWebhook } from '@opensequence/sdk';

const { SEQ_URL, SEQ_KEY } = process.env;
const oseq = new OpenSequence({ baseUrl: SEQ_URL!, apiKey: SEQ_KEY! });

const { secret } = await oseq.webhooks.create({
  url: 'https://crm.acme.com/hooks/seq',
  event_types: ['enrollment.exited'],
});

const app = express();
app.post('/hooks/seq', express.raw({ type: '*/*' }), (req, res) => {
  const event = verifyWebhook({ secret, headers: req.headers, body: req.body });
  console.log(event.type, event.data.exit_reason); // exited, replied
  res.sendStatus(204);
});`,
  },
  {
    id: 'results',
    label: 'Track results',
    icon: 'bar-chart',
    file: 'analytics.ts',
    meta: '@opensequence/sdk',
    lang: 'typescript',
    href: '/docs/analytics/endpoints',
    claim: 'Replies and meetings, counted once, per sequence and step.',
    code: `import { OpenSequence } from '@opensequence/sdk';

const { SEQ_URL, SEQ_KEY } = process.env;
const oseq = new OpenSequence({ baseUrl: SEQ_URL!, apiKey: SEQ_KEY! });

const { items } = await oseq.sequences.list();
const ukIntro = items.find((s) => s.name === 'UK intro')!;

const stats = await oseq.analytics.summary(ukIntro.id);
// enrolled: 412, replies: 61, reply_rate_per_100_enrolled: 14.8

// Which step earns the replies
const { nodes } = await oseq.analytics.nodes(ukIntro.id);`,
  },
];

/** Why own your sequencing, beyond the price. */
export const valueProps = [
  { icon: 'layout', label: 'Headless by design', text: 'No screens to learn and no tab to switch to. Sequences live inside the CRM your team already uses.' },
  { icon: 'database', label: 'Your data stays home', text: 'Contacts, messages and replies sit in your Postgres, in your region. The security review is your own.' },
  { icon: 'mail', label: 'Your deliverability', text: 'Mail leaves each rep’s own mailbox, not a shared pool. Their reputation is never borrowed or burned.' },
  { icon: 'git-branch', label: 'Sequences as code', text: 'Versioned JSON you can diff, review in a pull request and test against mock providers in CI.' },
  { icon: 'bot', label: 'Agent-native', text: 'MCP and scoped keys from day one: agents enroll and read journeys, and cannot change what they should not.' },
  { icon: 'search', label: 'No black boxes', text: 'Every decision is a row: which branch, which fact, which reply. Read the whole journey with one GET.' },
  { icon: 'building', label: 'Multi-tenant', text: 'One deployment, a project per customer. Ship sequencing inside your own SaaS without building it.' },
  { icon: 'puzzle', label: 'Extensible', text: 'Channels, node types and providers are registrations. Add LinkedIn, WhatsApp or your dialer without forking.' },
];

/** What usually happens when a team builds sequencing itself. Illustrative, not a customer story. */
export const buildTimeline = [
  { when: 'Day 1', text: 'A cron job and a loop send the first email. It works, and everyone moves on.' },
  { when: 'Week 3', text: 'A worker restarts mid-send. Forty prospects get the same email twice.' },
  { when: 'Month 2', text: 'Replies are matched by subject line. People who answered still get the follow-up.' },
  { when: 'Month 6', text: 'Texts land at 11 pm their time. The opt-outs pile up, and the on-call rota is you.' },
];

/** The hard parts, each with how the engine already handles it and the identifier it leaves behind. */
export const hardParts = [
  { icon: 'wallet', label: 'Expensive tools', problem: 'Sequencing tools charge per seat, every month, and the bill grows with every rep you hire.', handled: 'OpenSequence is free and open source. You pay for a Postgres and a container, whether you have 5 reps or 500.', evidence: 'Apache-2.0 · unlimited seats' },
  { icon: 'layers', label: 'Omnichannel complexity', problem: 'Email, SMS, calls and LinkedIn each have their own APIs, limits and failure modes, and one sequence has to coordinate all of them.', handled: 'One engine and one ledger. Email, SMS, call tasks and LinkedIn steps are modules with their own executors and queues.', evidence: 'channels: email · sms · call · linkedin' },
  { icon: 'gauge', label: 'Scaling', problem: 'Thousands of enrollments wake up at 09:00. One cron job falls behind, and two workers send the same step.', handled: 'A planner claims due work under a lease, executors scale out per channel, and one worker owns a step at a time.', evidence: 'SEQ_ROLES=worker · SEQ_QUEUE=redis' },
  { icon: 'repeat', label: 'Idempotency', problem: 'A crash between the send and the write cannot become two emails, ever.', handled: 'Every step has an idempotency key and its own Message-ID. After a crash the engine asks Gmail before it sends again.', evidence: 'Message-ID <seq.enr.01J9.intro.a1…>' },
  { icon: 'bar-chart', label: 'Analytics', problem: 'A reply has to count once, for the touch that earned it. Dashboards that double count are worse than none.', handled: 'Each reply and meeting is attributed to one touch per enrollment, direct or assisted, and queried from the ledger.', evidence: 'attribution: direct · touch 1' },
  { icon: 'shield', label: 'Authentication', problem: 'Every rep’s Gmail needs OAuth, refresh tokens that expire, and secrets that must never leak.', handled: 'A built-in auth module runs the consent flow, refreshes tokens before they expire, and stores every secret encrypted and write-only.', evidence: 'AES-256-GCM · key rotation' },
  { icon: 'mail', label: 'Deliverability', problem: 'Mail has to leave the rep’s own mailbox, in their thread, under their limits, or it lands in spam.', handled: 'Sends through the Gmail API as the rep, threads follow-ups, and enforces daily caps and minimum gaps.', evidence: 'daily_limit: 60 · min_gap_seconds: 90' },
  { icon: 'clock', label: 'Time zones', problem: 'Send windows and quiet hours belong to the contact. A text at 23:00 is a complaint, not a touch.', handled: 'Resolves each contact’s time zone from the contact, the phone or the country, then waits for the window.', evidence: 'sms: 08:00–21:00 recipient-local' },
  { icon: 'reply', label: 'Reply detection', problem: 'A reply, a booking, a bounce or an opt-out has to find its enrollment and stop it within seconds.', handled: 'One signal pipeline matches by thread, Message-ID and calendar attendee, then exits by the sequence’s rules.', evidence: 'exit_reason: replied' },
];


export const faq: Array<{ q: string; a: string }> = [
  { q: 'Is this a free alternative to Apollo, Lemlist or Outreach?', a: 'It is the sequencing part of those tools as an open source engine you run: multi-step email, SMS and call-task sequences, replies and exits, webhooks and analytics, behind an API, so your own product is the UI. There is no per-seat price; you pay for the Postgres and the container it runs on. It is not a prospect database or a warm-up service.' },
  { q: 'What does headless mean here?', a: 'OpenSequence has no user interface. Your CRM, an internal tool or an agent shows sequences, enrollments, tasks and analytics, and talks to the engine through the API. You keep your design, your permissions and your workflow.' },
  { q: 'Is it really fully configurable through the API?', a: 'Yes. Projects, keys, senders, channels, contacts, sequences and versions, enrollments, tasks, webhooks, settings and analytics are all endpoints: 81 operations in the OpenAPI file. The TypeScript SDK, the oseq CLI and the MCP server sit on the same API.' },
  { q: 'How do agents use it?', a: 'Connect the MCP server with an API key. Claude Code, Cursor and any MCP client get tools to list sequences, upsert contacts, preview and enroll, read a journey and pull analytics. Give agents a key with the enroll scope: they cannot edit sequences, senders or settings.' },
  { q: 'Does it send email itself?', a: 'Yes, through the Gmail API with each sender’s own consent and your own Google OAuth client. It sets its own Message-ID, adds List-Unsubscribe, replies in thread when asked, and never exceeds the channel’s daily limit. There is no shared sending pool.' },
  { q: 'What do I need to run it?', a: 'Node 22 in one image, Postgres 14 or newer, optionally Redis. Migrations run at boot. One process serves the API and runs the workers; split the roles when you scale.' },
];
