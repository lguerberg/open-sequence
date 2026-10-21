---
title: "How to build a sales sequencing tool"
h1: "How to build a sales sequencing tool, and what breaks after the cron job"
description: "How to build a sales sequencing tool: the seven parts, what breaks in each, 16 to 24 engineer-weeks of work, and when to use an open source engine instead."
date: 2026-10-14
updated: 2026-10-20
author: Leo Guerberg
tags: [engineering, build-vs-buy, email, architecture]
keyword: "how to build a sales sequencing tool"
kind: guide
---

To build a sales sequencing tool, you need seven parts: contacts, senders, versioned sequence definitions, enrollments, a scheduler, channel executors for email, SMS and call tasks, and webhooks back to your app. The cron job and the templates are the small part. A first production version that sends from reps' own inboxes, stops on replies and never double-sends takes one senior engineer about 16 to 24 weeks, plus upkeep. If you would rather not build it, [OpenSequence](https://github.com/lguerberg/open-sequence) is an open source (Apache-2.0), self-hosted engine with these seven parts behind an API.

We know the parts list because we built OpenSequence. Its service code is about 13,900 lines of TypeScript plus 3,600 lines of tests. Each section below names a failure mode, then shows how OpenSequence handles it, with code from the repo.

## The architecture of a sales sequencing tool

| Part | What it does | The hard part |
|---|---|---|
| Contacts | The people you reach, keyed by your CRM's ids, with email, phone, time zone and attributes | Keeping them in sync with your CRM, and honoring suppressions |
| Senders | The reps who send, each with their own mailbox and phone number | Storing mailbox passwords encrypted, and per-mailbox caps |
| Sequence definitions | The steps, waits, conditions and exit rules, as versioned JSON | Editing a sequence while people are in it |
| Enrollments | One contact's place in one sequence, with a status and a next run time | One active enrollment per contact, and exits that stick |
| Scheduler | Claims due enrollments and plans each step in the contact's time zone | Two workers and a crash must never send twice |
| Channels | Executors that send email over SMTP, texts and call tasks, and read replies and bounces | Threading, auto-replies, bounces and one-click unsubscribe |
| Webhooks | Signed events back to your app: sent, replied, exited, task created | Retries, ordering and a receiver that is down for a day |

The data flows in one direction. Your app upserts contacts and senders, publishes a definition and enrolls people. The scheduler and the channels do the work. Replies, bounces and opt-outs come back as signals that exit the enrollment, and webhooks tell your app. OpenSequence's [architecture page](https://docs.opensequence.dev/docs/self-hosting/scaling) shows the same parts as running processes.

## The naive version

```ts
// every 5 minutes
for (const e of await db.enrollments.due()) {
  await mailer.send(render(e.step, e.contact));
  await db.enrollments.advance(e.id);
}
```

What goes wrong with it in the first month:

| Failure | What the prospect sees |
|---|---|
| The process dies between `send` and `advance` | The same email twice |
| Two replicas run the loop | The same email twice |
| A reply arrives at 9:01 for a step due at 9:00 | A follow-up to someone who answered |
| The contact's time zone is unknown | An email at 3am |
| 400 enrollments come due at once | A rep's mailbox flagged for bulk sending |
| The loop counts an out-of-office reply as a reply | The lead drops out of the sequence |
| The loop ignores a bounce | More sends to a dead address and a worse sender reputation |
| Someone edits a sequence while people are in it | Contacts stuck on a step that no longer exists |

## Scheduling in the recipient's time zone

First you need the zone. OpenSequence takes the contact's IANA zone if your app sent one. Failing that, it derives a zone from the phone number, using a NANP area code or a country with one zone. After that it tries a single-zone country and, for email only, the sender's zone. For SMS it does not guess. It skips the step with `no_timezone`, because the 8:00 to 21:00 calling window in [47 CFR 64.1200(c)(1)](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200) applies in the recipient's local time.

The second problem is daylight saving time. In 2026 Europe falls back on October 25 and the US on November 1, so for one week London is four hours ahead of New York instead of five. A send time stored as "14:00 UTC" goes out at the wrong local hour that week. OpenSequence computes send windows in the contact's zone with `@date-fns/tz`. In its duration grammar `2d` is 48 hours, while `2bd` moves forward two weekdays in the contact's zone and keeps the wall-clock time. One test covers a step due Saturday at 10:00 BST with a weekday window of 08:00 to 18:00. The step sends on Monday at 08:00 GMT, after the clock change.

OpenSequence computes the timing when an enrollment enters a step and checks it again when the step runs, because the window and the caps can change in between. A configurable jitter keeps 300 sends from going out at exactly 09:00.

## Never double-send under at-least-once delivery

Queues deliver at least once. Say a worker crashes after the mail server accepted the email but before your database recorded it. The worker retries, and the prospect gets two copies. OpenSequence prevents this with two layers.

The first layer is ownership. While an executor works on a step, the enrollment's `owner_run_id` points at that run and `next_run_at` is null, so the planner cannot see it. Only the executor that finishes the run releases the enrollment. There is no lease that could expire in the middle of a send.

The second layer is an idempotency key on the email itself. Each run has a unique key (`seq:<enrollment>:<node>:a<attempt>`). OpenSequence derives the `Message-ID` header from that key, and a retry looks for the message in the mailbox before it sends:

```ts
export function messageIdFor(env: StepEnv, domain: string): string {
  return `<${env.run.idempotencyKey.replace(/[^a-z0-9]/gi, '.')}@${domain}>`;
}

const already = attempt > 1 ? await deps.providers.email.findSent({ channel: channelRef, messageId }) : null;
const sent = already ?? (await deps.providers.email.send({ /* ... */ messageId, headers }));
```

`findSent` is an IMAP search of the Sent folder, then the inbox, for that `Message-ID`. Texts have no equivalent key. For an SMS with an unknown outcome, OpenSequence searches the last ten minutes of outbound texts to that number. If that search is inconclusive, the run moves to `needs_review` instead of retrying. A double text is worse than a late one.

The database also rejects a second active enrollment for the same contact:

```sql
CREATE UNIQUE INDEX enrollments_one_active_idx ON seq.enrollments (project_id, contact_id)
  WHERE status IN ('active', 'paused', 'waiting_limit');
```

With the default Postgres queue, the enqueue is an insert in the same transaction as the run record, so "run recorded" and "message queued" commit together. The [queues page](https://docs.opensequence.dev/docs/self-hosting/database) covers the Redis case, where a reaper re-enqueues any run that was recorded but never queued.

## Per-mailbox caps

Providers publish ceilings. [Google Workspace](https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace) allows 2,000 messages a day per user (500 on trial accounts). [Exchange Online](https://learn.microsoft.com/en-us/office365/servicedescriptions/exchange-online-service-description/exchange-online-limits) allows 10,000 recipients a day and 30 messages a minute per mailbox. If you send through the [Gmail API](https://developers.google.com/workspace/gmail/api/reference/quota) instead of SMTP, each `messages.send` costs 100 quota units against a budget of 6,000 units per user per minute, and reply polling draws on the same budget.

Those numbers are ceilings, not targets. A provider can flag a rep's inbox that sends cold email anywhere near them. OpenSequence defaults each email channel to 30 sends per rolling 24 hours with a 60-second minimum gap. You can configure both per sender. When a sender is over the cap, OpenSequence defers the step instead of skipping it, and the enrollment shows `waiting_limit`. On each tick the planner claims at most 50 due enrollments per sender with `FOR UPDATE SKIP LOCKED`, and it takes follow-ups before first touches. One rep's 5,000-contact import therefore cannot starve everyone else.

OpenSequence sends over SMTP and reads replies over IMAP, so it works with Gmail, Google Workspace and most other providers. It does not support Microsoft 365 mailboxes, which no longer accept password sign-in for SMTP and IMAP.

## Reply detection and threading

Mail clients put a follow-up in the same thread when its `In-Reply-To` and `References` headers name the earlier messages, as RFC 5322 defines them. Gmail also wants a matching subject ([its threading rules](https://developers.google.com/workspace/gmail/api/guides/threads)). A `reply_in_thread` follow-up in OpenSequence sets both headers, and keeping the subject consistent is up to you. `In-Reply-To` names the enrollment's last email, and `References` lists every email of the thread so far.

For inbound mail, the service reads the IMAP inbox from a stored cursor every minute. It keeps only messages whose `In-Reply-To` or `References` headers name an email it sent from that mailbox in the last 30 days ([RFC 5322 section 3.6.4](https://www.rfc-editor.org/rfc/rfc5322#section-3.6.4)). The service stores nothing else from the rep's mailbox, and it does not store reply bodies.

An out-of-office reply arrives in the thread and looks like a real reply. OpenSequence treats a message as automatic when it has `Auto-Submitted` set to anything but `no` ([RFC 3834](https://www.rfc-editor.org/rfc/rfc3834)), an `X-Autoreply` or `X-Autorespond` header, `Precedence: auto_reply`, or a subject like "Automatic reply" or "Out of office" (with German, French and Spanish variants). An auto-reply never removes the contact from the sequence. Instead, OpenSequence pauses the enrollment until the return date it parses from the subject or text. If it finds no date, the pause lasts 7 days.

## Bounces and suppressions

A bounce is an email from `mailer-daemon@` or `postmaster@` with a `message/delivery-status` part ([RFC 3464](https://www.rfc-editor.org/rfc/rfc3464)). The adapter reads the status code and finds the original by our `Message-ID` in the attached headers. A `5.x.x` status is permanent and a `4.x.x` is transient ([RFC 3463](https://www.rfc-editor.org/rfc/rfc3463)). On a permanent bounce, OpenSequence writes a `hard_bounce` suppression and exits the contact. A transient bounce writes no suppression.

OpenSequence checks suppressions at enrollment and again at send time, because a contact can opt out in between. The [consent and suppressions page](https://docs.opensequence.dev/docs/concepts/contact) lists every source.

## One-click unsubscribe (RFC 8058)

[Google](https://support.google.com/a/answer/81126) requires one-click unsubscribe from senders of more than 5,000 messages a day to Gmail accounts. It [asks senders to honor requests within 48 hours](https://support.google.com/a/answer/14229414) and says to never reach a 0.3% spam rate. [Yahoo](https://senders.yahooinc.com/best-practices/) asks for the same header and asks senders to honor opt-outs within 2 days. Most reps sending 1:1 stay under the threshold. The header still costs little, and it gives a recipient a way out other than a spam complaint.

[RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.html) sets four requirements. The `List-Unsubscribe` header must carry an HTTPS URI. `List-Unsubscribe-Post` must be exactly `List-Unsubscribe=One-Click`. The POST must work with no cookies and no redirect. The DKIM signature must cover both headers. OpenSequence adds both headers to every email:

```ts
const headers = { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
```

The problem is link scanners. Many corporate mail filters fetch the URLs in a message, so a GET that unsubscribes removes people who never clicked. OpenSequence's `GET /u/{token}` only renders a page with a button. Only a POST writes the suppression and exits the enrollment, whether it comes from the button or from the mail client's one-click action. OpenSequence signs the token with HMAC, and the token is valid for 90 days. Once you set up a DKIM key for your Workspace domain, Gmail signs with it. Check that the `h=` tag in a sent message's `DKIM-Signature` lists both headers.

## Stopping on a meeting or a CRM change

A sequencer only sees its own channels. OpenSequence does not read calendars, so it cannot see a booked meeting, a deal moved to "closed won" or a do-not-contact flag in your CRM. Your app reports those through the [contact events API](https://docs.opensequence.dev/docs/get-started/integrate#report-what-the-service-cannot-see), which is idempotent on your event id. A homegrown sequencer has the same problem, so budget the CRM webhooks either way. The [CRM integration tutorial](/blog/add-sales-sequences-to-your-crm) shows that code for OpenSequence. OpenSequence does not watch the CRM. A `condition` step can still read a live value from Attio, such as `crm.deal.stage`, when it decides a branch.

A reply can also arrive in the second between the last check and the provider call. The enrollment row lock and a last-moment status check catch almost all of these. No design can close the remaining race, so OpenSequence logs those cases instead of hiding them.

## Editing a live sequence

Someone deletes step 3 while 200 people wait on it. OpenSequence makes published versions immutable, with a trigger that raises an error on any update to a non-draft definition. Each enrollment stays on the version id it started with, and new enrollments use the new default. To move people, you exit and re-enroll them. Drafts use an optimistic lock, so two editors cannot overwrite each other. The [versions page](https://docs.opensequence.dev/docs/sequences/versions) has the details.

## Call tasks

A `task` node creates a task for the rep and waits. It branches on the outcome your app sends back (`connected`, `voicemail`). If the task expires, the node takes the `no_answer` branch, and by default a task expires 7 days after it is due. With `dialer: true`, the number goes into the rep's Allo dialer and the call result completes the task. Otherwise your app needs a task inbox.

## Observability

Six weeks from now, someone will ask why Dana got that email, and you need an answer. OpenSequence writes every node execution as a row in an append-only run ledger. The row records the facts a condition read and the branch it took. Logs are Pino JSON with the enrollment and run ids on every line. The health endpoints return queue depths and the last run of each scheduler job. The [observability page](https://docs.opensequence.dev/docs/self-hosting/observability) lists what is missing today: a Prometheus endpoint and a per-channel circuit breaker.

## How long a build takes

This is our estimate for one senior engineer who has built queue-backed systems before, with one mailbox provider.

| Piece | Engineer-weeks |
|---|---|
| Data model, versions, enrollment rules | 2 |
| Scheduler, time zones, send windows | 2 |
| Executors, idempotency, retries | 3 |
| Mailbox connections and stored passwords | 2 |
| Replies, auto-replies, bounces | 3 |
| Unsubscribe, suppressions, SMS gates | 1 |
| Tasks and a dialer | 1.5 |
| Webhooks to your own app | 2 |
| Run ledger, health, logs | 1.5 |
| Mock providers, concurrency tests | 2 |
| **Total** | **20 (16 to 24)** |

Most of the range comes from the inbound side, where you keep finding bounce and auto-reply formats your parser does not handle. Each extra mailbox provider adds weeks. If you send through the Gmail API instead of SMTP and your OAuth client is public rather than internal to your Workspace, Google reviews apps that request restricted Gmail scopes. You do not control how long that review takes. After launch, someone has to handle login failures, provider API changes and the occasional stuck enrollment.

## Build or use an open source engine

Build it when sequencing is your product, or when your volume is tiny. A founder sending 20 emails a day from one inbox can get by with a script and a spreadsheet. Also build it when your rules fall far outside what any tool models and an engineer will own the code for years.

Buy a SaaS tool when nobody on the team can own a service, when reps need a finished UI tomorrow, or when you need Outlook mailboxes, open tracking or A/B tests on content. OpenSequence has none of those last three today. The [migration guide](/blog/replace-your-sales-sequencing-software) covers moving off a SaaS tool, and the [Outreach vs Salesloft cost breakdown](/blog/outreach-vs-salesloft-cost) prices the buy side.

Use an open source engine when you want to own the data and drop per-seat pricing without spending the 20 weeks. OpenSequence is the open source option: Apache-2.0, self-hosted, with an API, a TypeScript SDK (`npm install @opensequence/sdk`) and an MCP server. It is headless, so you bring the UI. It runs as one container on a Postgres database you own. [Enrollment](https://docs.opensequence.dev/docs/concepts/enrollment) is the 10-minute version of this post, and the [self-hosted deliverability guide](/blog/cold-email-deliverability-self-hosted) covers DNS and warm-up.

## FAQ

### How do I build a sales sequencing tool?

Build seven parts: contacts, senders, versioned sequence definitions, enrollments, a scheduler, channel executors and webhooks. Plan for 16 to 24 engineer-weeks for one mailbox provider, most of it on replies, bounces and idempotent sends.

### What is a sales sequencing tool?

It sends a planned series of emails, texts and call tasks to each prospect from a rep's own accounts. It stops the series when the prospect replies, books a meeting, bounces or opts out.

### Is there an open source alternative to Outreach or Salesloft sequences?

Yes. OpenSequence is an Apache-2.0, self-hosted engine for the sequencing part of Outreach and Salesloft, with no per-seat price and no UI of its own.

### How do I add email and SMS sequences to my CRM?

Run a sequencing engine next to your CRM and call its API from your backend: upsert contacts and senders by your own ids, enroll people, and write the webhooks back to your records. The [CRM tutorial](/blog/add-sales-sequences-to-your-crm) shows the code with OpenSequence.

### Is there a self-hosted sales engagement API?

Yes. OpenSequence runs as one Docker image on your Postgres and exposes sequences, enrollments, senders, tasks, webhooks and analytics as a REST API.

### Can I use a cron job to send follow-up emails?

For one inbox and a few dozen emails a day, yes. It breaks once you run two workers, retry after a crash, or need to stop the moment someone replies.

### How do I tell an out-of-office reply from a real reply?

Check the RFC 3834 `Auto-Submitted` header, then `X-Autoreply`, `X-Autorespond` and `Precedence: auto_reply`, then the subject line. Pause the sequence on an out-of-office instead of exiting it.

### Do cold emails need RFC 8058 one-click unsubscribe?

Google and Yahoo require it from bulk senders, meaning more than 5,000 messages a day to Gmail accounts. Most 1:1 sales email is under that line, but the two headers cost little and turn a spam complaint into an unsubscribe.

### How many emails can a Google Workspace user send per day?

Google's limit is 2,000 messages a day per user, or 500 on trial accounts. For cold outreach stay far below it; OpenSequence defaults to 30 a day per sender.

### Does OpenSequence work with Outlook or Microsoft 365?

Not today. Microsoft 365 no longer accepts password sign-in for SMTP and IMAP, which OpenSequence uses.
