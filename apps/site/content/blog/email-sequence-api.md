---
title: "Email sequence API: multi-step outreach in your product"
h1: "Email sequence API: how to add multi-step outreach to any product"
description: "What an email sequence API does, the six calls every integration makes, what to check before you pick one, and how to self-host one for sales, recruiting or CS."
date: 2026-11-10
updated: 2026-11-10
author: Leo Guerberg
tags: [api, sequences, recruiting, customer-success, self-hosting]
keyword: "email sequence API"
kind: guide
---

An email sequence API lets your own product run multi-step outreach: it sends a first email from a real person's mailbox, waits, follows up in the same thread, hands a call or LinkedIn task to a human, and stops by itself when the contact replies. Your app decides who to contact and shows the results. The API owns the timing, the sending and the stop rules.

We build OpenSequence, an open source (Apache-2.0) sequence engine that runs as one container and a Postgres. The calls below are the real ones from our [TypeScript SDK](https://docs.opensequence.dev/sdks/typescript), but the shape is the same for any API-first sequencer, so the checklist applies whichever one you pick.

## Who needs a sequence API

Sales teams were first, which is why the category is usually called sales engagement. The same loop of send, wait, follow up, call and stop on reply shows up wherever people write to other people one at a time:

- **Sales prospecting.** Reps sequence leads from the CRM they already use, instead of copying them into a second tool.
- **Recruiting.** Recruiters reach candidates from their own inbox, and every reply lands back in the applicant tracking system.
- **Customer onboarding and success.** The account owner checks in after a kickoff and skips the nudge when the customer already did the thing.
- **Renewals and expansion.** An email goes out 60 days before a renewal date, then a call task if nobody answers.
- **Partnerships, investors and press.** Founders send a few dozen careful emails a day from a real address.
- **SaaS platforms.** Vertical CRMs, ATSs and marketplaces ship sequences as a feature of their own product.
- **AI agents.** The agent picks who to contact and drafts the message. Something reliable still has to send it at the right time and stop on a reply.

What these have in common: the messages are one-to-one, they come from a named person, and a reply ends the sequence. That is what separates a sequence API from a marketing email API. A lifecycle platform such as Customer.io sends product email to people who signed up, from a shared sending domain. A sequence API sends conversation starters from a person's mailbox. We wrote up [where Customer.io fits and where it breaks](/blog/customer-io-for-sales-sequences) for one-to-one outreach.

## The six calls every integration makes

Every sequence API integration comes down to six calls, whatever the vendor.

### 1. Register the sender and their mailbox

A sender is the person the email comes from. The engine sends over SMTP and reads replies over IMAP, so mail leaves their real mailbox and lands in their real Sent folder.

```ts
import { OpenSequence } from '@opensequence/sdk';

const oseq = new OpenSequence({ baseUrl: process.env.SEQ_URL!, apiKey: process.env.SEQ_KEY! });

await oseq.senders.upsert('ana', { name: 'Ana Silva', email: 'ana@acme.com' });
const login = { user: 'ana@acme.com', password: process.env.ANA_APP_PASSWORD!, secure: true };
await oseq.senders.setSmtp('ana', {
  provider: 'smtp',
  smtp: { host: 'smtp.gmail.com', port: 465, ...login },
  imap: { host: 'imap.gmail.com', port: 993, ...login },
});
```

### 2. Sync the contact, keyed by your own id

Use the id your database already has. Anything your product knows about the contact goes in `attrs`, and sequences can branch on it later.

```ts
await oseq.contacts.upsert('cus_481', {
  first_name: 'Dana',
  email: 'dana@example.com',
  attrs: { plan: 'trial', activated: false },
});
```

### 3. Publish a sequence

A sequence is a versioned JSON document: a flat map of named steps with named transitions. This one is an onboarding check-in. It skips the second email for customers who activated in the meantime and hands the rest to a call.

```ts
const { sequence, version } = await oseq.sequences.create({
  name: 'Trial check-in',
  definition: {
    entry: 'hello',
    exit_on: ['reply', 'meeting_booked'],
    nodes: {
      hello: {
        type: 'outreach',
        channel: 'email',
        action: 'send',
        params: { subject: 'Your first week', body: 'Hi {{ contact.first_name }}, …' },
        next: { sent: 'wait' },
      },
      wait: { type: 'wait', params: { duration: '2bd' }, next: { then: 'check' } },
      check: {
        type: 'condition',
        params: { mode: 'all', rules: [{ field: 'attrs.activated', op: 'is_true' }] },
        next: { yes: 'done', no: 'call' },
      },
      call: {
        type: 'task',
        params: { kind: 'call', title: 'Call {{ contact.first_name }}', due: '1bd' },
      },
      done: { type: 'end', params: { label: 'activated' } },
    },
  },
});
await oseq.sequences.versions.publish(sequence.id, version.id);
```

Because the definition is JSON with no code in it, you can keep it in your repository, review changes in a pull request and let an agent edit it safely.

### 4. Enroll

```ts
await oseq.sequences.enroll(sequence.id, { contacts: ['cus_481'], sender: 'ana' });
```

From here the engine schedules every step in the contact's time zone, inside the send window, under the sender's daily cap.

### 5. Report what happened in your world

The engine sees replies, bounces and opt-outs on its own channels. It cannot see your calendar or your database, so your app reports those:

```ts
await oseq.contacts.reportEvent('cus_481', { id: booking.id, type: 'meeting_booked' });
await oseq.contacts.patch('cus_481', { attrs: { activated: true } });
```

### 6. Listen for webhooks

Signed events tell your app when someone replied, exited or got a task, so your UI can show it.

```ts
import { verifyWebhook } from '@opensequence/sdk';

const event = verifyWebhook({ secret, headers: req.headers, body: req.body });
if (event.type === 'enrollment.exited') markDone(event.data);
```

That is the whole surface for most products. The [integration checklist](https://docs.opensequence.dev/docs/get-started/integrate) lists every call in order.

## What to check before you pick one

Most of the work in a sequencer is in the parts nobody sees in a demo. These are the questions worth asking any vendor, or yourself if you plan to build one.

| Question                                                   | Why it matters                                                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Does mail leave each sender's own mailbox?                 | A shared sending pool ties your domain's reputation to other people's lists.                         |
| Does it stop on a reply within seconds, matched by thread? | Matching replies by subject line keeps following up with people who already answered.                |
| Is each step idempotent?                                   | A worker that crashes between sending and saving must not send the email twice.                      |
| Are send windows in the contact's time zone?               | A text at 23:00 their time brings complaints and opt-outs.                                           |
| Can a step be a task for a human?                          | Calls and LinkedIn requests are part of most sequences, and LinkedIn forbids automating invitations. |
| Are running enrollments pinned to a version?               | Editing a live sequence should not change what people halfway through it receive.                    |
| Can one deployment serve many customers?                   | If you ship sequences inside your own SaaS, each customer needs its own keys and data.               |
| Where do contacts and messages live?                       | Hosted tools keep your contact data. A self-hosted engine keeps it in your Postgres.                 |

We go through what breaks in each of these, and how long each takes to build, in [how to build a sales sequencing tool](/blog/build-your-own-sales-sequencer).

## Hosted API or self-hosted engine

Several sales engagement tools expose a sequence API on top of their product, usually on a per-user plan. They make sense when your team already lives in that tool and the API is a way to push leads into it.

A self-hosted engine makes sense when the sequences belong inside your own product: your CRM, your ATS, your customer platform or your agent. You pay for a container and a database rather than per seat, the data stays in your region, and your UI is the only UI. The cost is that you run one more service. For the numbers on a 15-person team, see [Outreach vs Salesloft pricing](/blog/outreach-vs-salesloft-cost).

## FAQ

### What is an email sequence API?

An email sequence API is a service your code calls to run multi-step, one-to-one outreach. You register senders and contacts, publish a sequence of emails, waits, conditions and tasks, and enroll people. The service sends each step from the sender's mailbox at the right time and stops when the contact replies, bounces or opts out.

### Is an email sequence API the same as a transactional email API?

No. A transactional email API, such as one for password resets or receipts, sends one message when your code asks. A sequence API owns a schedule over days or weeks, sends from a named person's mailbox, reads replies, and decides on its own when to stop.

### Can I use a sequence API for recruiting or customer success, not only sales?

Yes. The mechanics are the same: one-to-one messages from a person, follow-ups in the same thread, tasks for calls, and an exit on reply. OpenSequence has no sales-specific fields. Conditions branch on any attribute your product stores on the contact, such as a candidate's stage or a customer's plan.

### Is there an open source email sequence API?

Yes. OpenSequence is Apache-2.0 and runs as one Docker image on your own Postgres. It covers email, SMS, call tasks and LinkedIn steps, with a REST API, a TypeScript SDK, signed webhooks and an MCP server for agents.
