---
title: "What breaks when you build your own sales sequencer"
h1: "What breaks after the cron job when you build your own sales sequencer"
description: "A sales sequencer takes 16 to 24 engineer-weeks, not a cron job. This post covers time zones, double sends, caps, replies, bounces and RFC 8058, with our code."
date: 2026-10-14
updated: 2026-10-14
author: Leo Guerberg
tags: [engineering, build-vs-buy, email, architecture]
keyword: "build your own sales sequencer"
---

You can build your own sales sequencer, but the cron job and the templates are the small part. Take a first production version that sends from reps' own Gmail inboxes, stops on replies and never double-sends. It takes one senior engineer about 16 to 24 weeks, plus upkeep. We know the parts list because we built one. We make [OpenSequence](https://github.com/lguerberg/open-sequence), an Apache-2.0 sequencing service. Its service code is about 13,900 lines of TypeScript plus 3,600 lines of tests.

Each section below names a failure mode, then shows how OpenSequence handles it, with code from the repo.

## The naive version

```ts
// every 5 minutes
for (const e of await db.enrollments.due()) {
  await gmail.send(render(e.step, e.contact));
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

Queues deliver at least once. Say a worker crashes after Gmail accepted the email but before your database recorded it. The worker retries, and the prospect gets two copies. OpenSequence prevents this with two layers.

The first layer is ownership. While an executor works on a step, the enrollment's `owner_run_id` points at that run and `next_run_at` is null, so the planner cannot see it. Only the executor that finishes the run releases the enrollment. There is no lease that could expire in the middle of a send.

The second layer is an idempotency key on the email itself. Each run has a unique key (`seq:<enrollment>:<node>:a<attempt>`). OpenSequence derives the `Message-ID` header from that key, and a retry asks Gmail whether the message already went out:

```ts
export function messageIdFor(env: StepEnv, domain: string): string {
  return `<${env.run.idempotencyKey.replace(/[^a-z0-9]/gi, '.')}@${domain}>`;
}

const already = attempt > 1 ? await deps.providers.email.findSent({ channel: channelRef, messageId }) : null;
const sent = already ?? (await deps.providers.email.send({ /* ... */ messageId, headers }));
```

`findSent` is a Gmail search for `rfc822msgid:<id>`. Texts have no equivalent key. For an SMS with an unknown outcome, OpenSequence searches the last ten minutes of outbound texts to that number. If that search is inconclusive, the run moves to `needs_review` instead of retrying. A double text is worse than a late one.

The database also rejects a second active enrollment for the same contact:

```sql
CREATE UNIQUE INDEX enrollments_one_active_idx ON seq.enrollments (project_id, contact_id)
  WHERE status IN ('active', 'paused', 'waiting_limit');
```

With the default Postgres queue, the enqueue is an insert in the same transaction as the run record, so "run recorded" and "message queued" commit together. The [queues page](https://docs.opensequence.dev/docs/self-hosting/queues) covers the Redis case, where a reaper re-enqueues any run that was recorded but never queued.

## Per-mailbox caps

Providers publish ceilings. [Google Workspace](https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace) allows 2,000 messages a day per user (500 on trial accounts). [Exchange Online](https://learn.microsoft.com/en-us/office365/servicedescriptions/exchange-online-service-description/exchange-online-limits) allows 10,000 recipients a day and 30 messages a minute per mailbox. The [Gmail API](https://developers.google.com/workspace/gmail/api/reference/quota) charges 100 quota units per `messages.send` against a budget of 6,000 units per user per minute. Your reply polling draws on the same budget.

Those numbers are ceilings, not targets. A provider can flag a rep's inbox that sends cold email anywhere near them. OpenSequence defaults each email channel to 30 sends per rolling 24 hours with a 60-second minimum gap. You can configure both per sender. When a sender is over the cap, OpenSequence defers the step instead of skipping it, and the enrollment shows `waiting_limit`. On each tick the planner claims at most 50 due enrollments per sender with `FOR UPDATE SKIP LOCKED`, and it takes follow-ups before first touches. One rep's 5,000-contact import therefore cannot starve everyone else.

OpenSequence sends through Gmail only today. It does not support Outlook or Microsoft 365 mailboxes. An SMTP and IMAP adapter is on the roadmap.

## Reply detection and threading

Gmail's [threading rules](https://developers.google.com/workspace/gmail/api/guides/threads) need three things: the `threadId` on the send request, `In-Reply-To` and `References` headers as RFC 5322 defines them, and a matching subject. A `reply_in_thread` follow-up in OpenSequence sets the first two, and keeping the subject consistent is up to you. `In-Reply-To` names the enrollment's last email, and `References` lists every email of the thread so far. OpenSequence takes the Gmail `threadId` from the thread where it recorded the earlier send.

For inbound mail, the service reads the Gmail history feed from a stored cursor every minute. It keeps only messages in threads it started in the last 30 days. It matches them by thread id, or by finding our `Message-ID` in the `In-Reply-To` and `References` headers ([RFC 5322 section 3.6.4](https://www.rfc-editor.org/rfc/rfc5322#section-3.6.4)). The service stores nothing else from the rep's mailbox, and it stores inbound bodies only if the project turns that on.

An out-of-office reply arrives in the thread and looks like a real reply. OpenSequence treats a message as automatic when it has `Auto-Submitted` set to anything but `no` ([RFC 3834](https://www.rfc-editor.org/rfc/rfc3834)), an `X-Autoreply` or `X-Autorespond` header, `Precedence: auto_reply`, or a subject like "Automatic reply" or "Out of office" (with German, French and Spanish variants). An auto-reply never removes the contact from the sequence. Instead, OpenSequence pauses the enrollment until the return date it parses from the subject or snippet. If it finds no date, the pause lasts 7 days.

## Bounces and suppressions

A bounce is an email from `mailer-daemon@` or `postmaster@` with a `message/delivery-status` part ([RFC 3464](https://www.rfc-editor.org/rfc/rfc3464)). The adapter reads the status code and finds the original by our `Message-ID` in the attached headers. A `5.x.x` status is permanent and a `4.x.x` is transient ([RFC 3463](https://www.rfc-editor.org/rfc/rfc3463)). On a permanent bounce, OpenSequence writes a `hard_bounce` suppression and exits the contact. A transient bounce writes no suppression.

OpenSequence checks suppressions at enrollment and again at send time, because a contact can opt out in between. The [consent and suppressions page](https://docs.opensequence.dev/docs/contacts/consent-and-suppressions) lists every source.

## One-click unsubscribe (RFC 8058)

[Google](https://support.google.com/a/answer/81126) requires one-click unsubscribe from senders of more than 5,000 messages a day to Gmail accounts. It [asks senders to honor requests within 48 hours](https://support.google.com/a/answer/14229414) and says to never reach a 0.3% spam rate. [Yahoo](https://senders.yahooinc.com/best-practices/) asks for the same header and asks senders to honor opt-outs within 2 days. Most reps sending 1:1 stay under the threshold. The header still costs little, and it gives a recipient a way out other than a spam complaint.

[RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.html) sets four requirements. The `List-Unsubscribe` header must carry an HTTPS URI. `List-Unsubscribe-Post` must be exactly `List-Unsubscribe=One-Click`. The POST must work with no cookies and no redirect. The DKIM signature must cover both headers. OpenSequence adds both headers to every email:

```ts
const headers = { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
```

The problem is link scanners. Many corporate mail filters fetch the URLs in a message, so a GET that unsubscribes removes people who never clicked. OpenSequence's `GET /u/{token}` only renders a page with a button. Only a POST writes the suppression and exits the enrollment, whether it comes from the button or from the mail client's one-click action. OpenSequence signs the token with HMAC, and the token is valid for 90 days. Once you set up a DKIM key for your Workspace domain, Gmail signs with it. Check that the `h=` tag in a sent message's `DKIM-Signature` lists both headers.

## Stopping on a meeting or a CRM change

A sequencer only sees its own channels. OpenSequence detects a meeting when a new event on the sender's connected Google Calendar has the contact as an attendee. It cannot see a booking in another tool, a deal moved to "closed won" or a do-not-contact flag in your CRM. Your app reports those through the [contact events API](https://docs.opensequence.dev/docs/contacts/events), which is idempotent on your event id. A homegrown sequencer has the same problem, so budget the CRM webhooks either way. The [CRM integration tutorial](/blog/add-sales-sequences-to-your-crm) shows that code for OpenSequence. OpenSequence does not watch the CRM. A `condition` step can still read a live value from Attio, such as `crm.deal.stage`, when it decides a branch.

A reply can also arrive in the second between the last check and the provider call. The enrollment row lock and a last-moment status check catch almost all of these. No design can close the remaining race, so OpenSequence logs those cases instead of hiding them.

## Editing a live sequence

Someone deletes step 3 while 200 people wait on it. OpenSequence makes published versions immutable, with a trigger that raises an error on any update to a non-draft definition. Each enrollment stays on the version id it started with, and new enrollments use the new default. To move people, you exit and re-enroll them. Drafts use an optimistic lock, so two editors cannot overwrite each other. The [versions page](https://docs.opensequence.dev/docs/sequences/versions) has the details.

## Call tasks

A `task` node creates a task for the rep and waits. It branches on the outcome your app sends back (`connected`, `voicemail`). If the task expires, the node takes the `no_answer` branch, and by default a task expires 7 days after it is due. With `dialer: true`, the number goes into the rep's Allo dialer and the call result completes the task. Otherwise your app needs a task inbox.

## Observability

Six weeks from now, someone will ask why Dana got that email, and you need an answer. OpenSequence writes every node execution as a row in an append-only run ledger. The row records the facts a condition read and the branch it took. Logs are Pino JSON with the enrollment and run ids on every line. The health endpoints return queue depths and the last run of each scheduler job. The [observability page](https://docs.opensequence.dev/docs/self-hosting/observability) lists what is missing today: a Prometheus endpoint and a per-channel circuit breaker.

## How long a build takes

This is our estimate for one senior engineer who has built queue-backed systems before, with Gmail as the only mailbox provider.

| Piece | Engineer-weeks |
|---|---|
| Data model, versions, enrollment rules | 2 |
| Scheduler, time zones, send windows | 2 |
| Executors, idempotency, retries | 3 |
| Google OAuth and token refresh | 2 |
| Replies, auto-replies, bounces | 3 |
| Unsubscribe, suppressions, SMS gates | 1 |
| Tasks and a dialer | 1.5 |
| Webhooks to your own app | 2 |
| Run ledger, health, logs | 1.5 |
| Mock providers, concurrency tests | 2 |
| **Total** | **20 (16 to 24)** |

Most of the range comes from the inbound side, where you keep finding bounce and auto-reply formats your parser does not handle. Each extra mailbox provider adds weeks. If your Google OAuth client is public rather than internal to your Workspace, Google reviews apps that request restricted Gmail scopes. You do not control how long that review takes. After launch, someone has to handle token failures, provider API changes and the occasional stuck enrollment.

## When building your own is the right call

Build it when sequencing is your product, or when your volume is tiny. A founder sending 20 emails a day from one inbox can get by with a script and a spreadsheet. Also build it when your rules fall far outside what any tool models and an engineer will own the code for years.

Buy a SaaS tool when nobody on the team can own a service, when reps need a finished UI tomorrow, or when you need Outlook mailboxes, open tracking or A/B tests on content. OpenSequence has none of those last three today. The [migration guide](/blog/replace-your-sales-sequencing-software) covers moving off a SaaS tool, and the [Outreach vs Salesloft cost breakdown](/blog/outreach-vs-salesloft-cost) prices the buy side.

Self-host an open source engine when you want to own the data and drop per-seat pricing without spending the 20 weeks. OpenSequence is headless, so you bring the UI. It runs as one container on a Postgres database you own. [How it works](https://docs.opensequence.dev/docs/get-started/how-it-works) is the 10-minute version of this post, and the [self-hosted deliverability guide](/blog/cold-email-deliverability-self-hosted) covers DNS and warm-up.

## FAQ

### How long does it take to build a sales sequencer?

A script that sends a follow-up after N days takes a few days. A production sequencer with time zones, idempotent sends, reply and bounce detection, one-click unsubscribe and versioning is a bigger job. We estimate about 16 to 24 engineer-weeks for one mailbox provider.

### Can I use a cron job to send follow-up emails?

For one inbox and a few dozen emails a day, yes. It breaks once you run two workers, retry after a crash, or need to stop the moment someone replies. At that point you need row-level ownership of each step and an idempotency key on each send.

### Do cold emails need RFC 8058 one-click unsubscribe?

Google's and Yahoo's rules require it for bulk senders, which Google defines as senders of more than 5,000 messages a day to Gmail accounts. Most 1:1 sales email falls under that line. Adding the `List-Unsubscribe` and `List-Unsubscribe-Post` headers costs little and turns a likely spam complaint into an unsubscribe.

### How do I tell an out-of-office reply from a real reply?

Check the `Auto-Submitted` header from RFC 3834 first, then `X-Autoreply`, `X-Autorespond` and `Precedence: auto_reply`, then the subject line. Some auto-replies set none of these headers, so the subject check is not optional. Pause the sequence on an out-of-office instead of exiting it.

### How many emails can a Google Workspace user send per day?

Google's published limit is 2,000 messages a day per user, or 500 on trial accounts. For cold outreach from a rep's own inbox, stay far below that. OpenSequence defaults to 30 a day per sender.

### Does OpenSequence work with Outlook or Microsoft 365?

Not today. OpenSequence sends email through Gmail with each rep's Google account, and an SMTP and IMAP adapter is on the roadmap.
