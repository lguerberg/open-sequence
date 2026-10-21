---
title: "How to add sales sequences to your own CRM"
h1: "How to add sales sequences to your own CRM or internal tool"
description: "Add Outreach-style email, call and SMS sequences to a custom CRM: sync contacts, build an Enroll button, write replies back, and run a task inbox. With code."
date: 2026-10-15
updated: 2026-10-20
author: Leo Guerberg
tags: [crm, tutorial, api, self-hosting]
keyword: "add sales sequences to your CRM"
---

To add sales sequences to a CRM you built yourself, run a sequencing engine next to it and connect the two through an API and webhooks. Your CRM keeps the people, the deals and the screens. The engine keeps the sequences, sends the emails from each rep's own mailbox, creates call tasks, and tells your CRM when someone replies, books a meeting or bounces. This tutorial does it with OpenSequence and TypeScript.

We build OpenSequence, an open source (Apache-2.0) engine that runs as one container and a Postgres. The steps below match how any API-first sequencer works, so most of the design carries over if you pick another one. The SDK calls and event names are the real ones from our [TypeScript SDK](https://docs.opensequence.dev/sdks/typescript).

## Who this is for

You have a CRM or an internal tool that reps work in every day. It might be a Next.js app on your own database, or Attio or HubSpot with your own app around them. Your reps want sequences like the ones in Outreach or Apollo. You do not want a second tool where reps re-type contacts, and you do not want to pay for a sales engagement seat per rep to get one feature.

If you have no engineer, stop here. Buy a hosted tool. Our [Apollo alternatives comparison](/blog/apollo-alternatives) lists the hosted options with prices.

## What lives where

Your CRM owns the records reps care about: people, companies, deals, owners, and the activity timeline. OpenSequence owns five things. A contact is a copy of your person, keyed by your id. A sender is a rep, with their connected mailbox and phone. A sequence is a versioned JSON definition. An enrollment is one contact going through one sequence as one sender. A task is a call or any other manual step waiting for a human.

The link between the two systems is your id. You call the contact `p_7` in OpenSequence because it is `p_7` in your database, and every API route accepts your id wherever it accepts ours ([ids and external ids](https://docs.opensequence.dev/api/conventions)). You never have to store an OpenSequence contact id.

Data flows in two directions. Your CRM pushes contacts, enrollments and task outcomes in. OpenSequence pushes events back through signed webhooks. Nothing else syncs.

## Step 1. Run the engine and connect each rep's mailbox

The [install guide](https://docs.opensequence.dev/docs/self-hosting/install) covers the container, the database and the project key. Two parts matter for the CRM integration.

Create a sender per rep, then save their mailbox from your settings page. The engine sends over SMTP and reads replies over IMAP, so it needs the server settings and a password. On Google Workspace or Gmail, that is an app password the rep creates once. The engine signs in to both servers before it stores anything:

```ts
// lib/oseq.ts
import { OpenSequence } from '@opensequence/sdk';

export const oseq = new OpenSequence({ baseUrl: process.env.OSEQ_URL!, apiKey: process.env.OSEQ_KEY! });
```

```ts
// app/api/settings/connect-mailbox/route.ts
import { oseq } from '@/lib/oseq';
import { requireUser } from '@/lib/auth';

export async function POST(req: Request) {
  const rep = await requireUser(req);
  const { appPassword } = await req.json();
  await oseq.senders.upsert(rep.id, { name: rep.name, email: rep.email, timezone: rep.timezone });
  const login = { user: rep.email, password: appPassword, secure: true };
  // A wrong password comes back as a 422 with a code such as SMTP_AUTH_FAILED.
  const channel = await oseq.senders.setSmtp(rep.id, {
    provider: 'smtp',
    smtp: { host: 'smtp.gmail.com', port: 465, ...login },
    imap: { host: 'imap.gmail.com', port: 993, ...login },
  });
  return Response.json({ status: channel.status });
}
```

The rep's user id becomes the sender id, so later calls pass `rep.id` and nothing else. `oseq.senders.readiness(rep.id)` tells your settings page whether email is ready to send and, if not, why. The [email setup guide](https://docs.opensequence.dev/docs/modules/email) lists the server settings for Gmail, Fastmail, Zoho, iCloud and others.

The code uses the TypeScript SDK: `npm install @opensequence/sdk`. The MCP server ships with the repository and the Docker image.

## Step 2. Sync contacts from your CRM

Push a person into OpenSequence when they become someone a rep might sequence. You do not need to copy your whole database. `contacts.batch` takes up to 500 people per call and upserts by your id:

```ts
await oseq.contacts.batch(
  people.map((p) => ({
    external_id: p.id,
    first_name: p.firstName,
    last_name: p.lastName,
    email: p.email,
    phone: p.phone,
    timezone: p.timezone,
    attrs: { company: { name: p.company.name }, deal: { stage: p.deal?.stage ?? null } },
  }))
);
```

Two fields deserve care. `timezone` decides when emails land, because the send window runs in the contact's zone and falls back to the sender's when it is empty. `attrs` is free JSON that templates and conditions read, so put there the fields a sequence will branch on or mention: the company name, the deal stage, the plan. When a deal moves, patch only that field with `oseq.contacts.patch(p.id, { attrs: { deal: { stage: 'proposal' } } })`. The [attributes page](https://docs.opensequence.dev/docs/concepts/attributes) shows how conditions read them.

You can also skip the sync and pass contacts inline when you enroll. The engine upserts them first. That is simpler, but a nightly batch keeps `attrs` fresh for people already mid-sequence.

## Step 3. Define a sequence in code

A sequence is one JSON document of nodes and named transitions. This one sends an intro email, waits up to three business days for a reply, sends a follow-up in the same thread, then creates a call task:

```ts
const definition = {
  schema_version: 1,
  entry: 'intro',
  settings: {
    send_window: { days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '08:00', to: '18:00', tz: 'contact' },
    jitter: '15m',
  },
  exit_on: ['reply', 'meeting_booked'],
  nodes: {
    intro: {
      type: 'outreach', channel: 'email', action: 'send',
      params: {
        subject: 'Quick question, {{ contact.first_name | "there" }}',
        body: 'Hi {{ contact.first_name | "there" }}, I saw {{ attrs.company.name | "your team" }} is hiring. Worth a call?\n\n{{ sender.first_name }}\n\n{{ unsubscribe_url }}',
      },
      next: { sent: 'wait_reply', skipped: 'wait_reply' },
    },
    wait_reply: {
      type: 'wait_for',
      params: { events: ['reply:email'], timeout: '3bd' },
      next: { 'reply:email': 'done', timeout: 'follow_up' },
    },
    follow_up: {
      type: 'outreach', channel: 'email', action: 'send',
      params: { subject: 'Re: Quick question', body: 'Bumping this up, {{ contact.first_name | "there" }}.\n\n{{ unsubscribe_url }}', reply_in_thread: true },
      next: { sent: 'call' },
    },
    call: {
      type: 'task',
      params: { kind: 'call', title: 'Call {{ contact.first_name | "them" }}', due: '1bd', expire: '3bd' },
      next: { completed: 'done', no_answer: 'done' },
    },
    done: { type: 'end', params: { label: 'Done' } },
  },
};

const { ok, problems } = await oseq.sequences.validate(definition);
const { sequence, version } = await oseq.sequences.create({ name: 'Inbound demo follow-up', definition });
await oseq.sequences.versions.publish(sequence.id, version.id);
```

A template that reads `contact.first_name` without a fallback fails to publish, because some contacts have no first name. A body without `{{ unsubscribe_url }}` publishes with a warning. A published version cannot change, so contacts already in it finish the version they started; edits go into a new version ([versions](https://docs.opensequence.dev/docs/concepts/sequence/versions)).

Keep the definitions in your repository next to the code that enrolls into them. A pull request then shows what a sequence change does, and a deploy script can create the new version and publish it.

## Step 4. Put an Enroll button in your CRM

The button calls one route on your server. The route checks the user, then enrolls the selected people as that rep:

```ts
// app/api/sequences/[id]/enroll/route.ts
import { OpenSequenceError } from '@opensequence/sdk';
import { oseq } from '@/lib/oseq';
import { requireUser } from '@/lib/auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rep = await requireUser(req);
  const { id } = await params;
  const { personIds, rehearse } = (await req.json()) as { personIds: string[]; rehearse?: boolean };

  try {
    const result = await oseq.sequences.enroll(id, {
      contacts: personIds,
      sender: rep.id,
      enrolled_by: rep.id,
      enrolled_by_kind: 'user',
      mode: rehearse ? 'dry_run' : 'live',
    });
    return Response.json({ accepted: result.accepted, skipped: result.skipped, capacity: result.capacity });
  } catch (err) {
    if (err instanceof OpenSequenceError && err.is('ALREADY_IN_SEQUENCE')) {
      return Response.json({ conflicts: (err.details as { conflicts: unknown[] }).conflicts }, { status: 409 });
    }
    throw err;
  }
}
```

Three behaviours of the enroll call shape the UI. A contact can be in one active sequence at a time. If any selected person already is, the call enrolls nobody and returns a 409 that names each conflict, so the dialog can say "Dana Whitfield is already in UK facilities managers" and let the rep remove her. Suppressed people come back in `skipped` with a reason, and the rest still enroll. `capacity` tells you how many days the first emails take at the rep's daily cap, which the dialog can show as "first emails finish in about 3 days".

Call `oseq.sequences.previewEnrollment` with the same arguments before the rep confirms. It returns the same result and errors and writes nothing. `mode: 'dry_run'` goes one step further: it creates real enrollments whose emails are rendered and recorded but not sent, which is how you rehearse a new sequence on one contact ([enrolling](https://docs.opensequence.dev/docs/concepts/enrollment)).

## Step 5. Write activity back to your CRM

Register one webhook endpoint and handle the events your timeline needs. The handler verifies the signature on the raw body, then writes rows keyed by the event id so a retried delivery does nothing twice:

```ts
// app/api/hooks/opensequence/route.ts
import { verifyWebhook } from '@opensequence/sdk';
import { db } from '@/lib/db';

type Signal = { kind: string; channel: string | null; occurred_at: string };
type Contact = { external_id: string };

export async function POST(req: Request) {
  const event = verifyWebhook({ secret: process.env.OSEQ_WEBHOOK_SECRET!, headers: req.headers, body: await req.text() });
  const data = event.data as Record<string, unknown>;

  switch (event.type) {
    case 'signal.received': {
      const { signal, contact } = data as { signal: Signal; contact: Contact };
      await db.activity.upsert({
        id: event.id,
        personId: contact.external_id,
        kind: signal.kind,
        channel: signal.channel,
        at: signal.occurred_at,
      });
      break;
    }
    case 'enrollment.exited': {
      const { enrollment, exit_reason } = data as { enrollment: { contact: string }; exit_reason: string };
      const person = await oseq.contacts.get(enrollment.contact);
      await db.person.update({ id: person.externalId, sequenceStatus: `exited: ${exit_reason}` });
      break;
    }
  }
  return new Response(null, { status: 204 });
}
```

`signal.received` covers replies, bounces, opt-outs, meetings, connected calls and completed tasks, and it carries your id for the contact. `run.done` fires for every sent step if you want each email on the timeline too. `enrollment.exited` and `enrollment.completed` tell you a person left a sequence and why. Deliveries retry for three days and arrive in order per enrollment, but they can arrive twice, which is why the handler upserts by `event.id` ([receiving webhooks](https://docs.opensequence.dev/docs/developers/webhooks/events)).

Create the endpoint once with `oseq.webhooks.create({ url, event_types: ['signal.received', 'enrollment.exited', 'task.created', 'task.expired'] })` and store the secret it returns. The call needs an admin-scoped key.

## Step 6. Give each rep a task inbox

Call steps, and any step you define with a `kind` of your own, become tasks for the rep. OpenSequence sends email and SMS itself; everything else a person does by hand, and the sequence waits for the outcome. Your CRM shows the open tasks and posts the outcome back:

```ts
const { items } = await oseq.tasks.list({ sender: rep.id, status: 'open' });

// when the rep logs the call
await oseq.tasks.complete(taskId, { outcome: 'connected', note: 'Booked a demo for Thursday.' });
```

The outcome is free text up to 32 characters. The sequence can branch on it, and an outcome listed in the node's `connected_outcomes` counts as a conversation, which exits the enrollment when `exit_on` includes `reply`. A task nobody completes expires and the sequence takes its `no_answer` path. To keep the inbox live without polling, mirror `task.created` and `task.expired` into your own table. The [tasks page](https://docs.opensequence.dev/docs/modules/sms/allo) lists the fields to store.

## Step 7. Stop sequences from CRM events

OpenSequence sees replies to emails it sent, bounces, unsubscribe clicks and STOP texts. It does not see your CRM or anyone's calendar. When something there should end the outreach, report it:

```ts
// a rep marked the person do-not-contact
await oseq.contacts.reportEvent(person.id, { id: `dnc-${person.id}`, type: 'suppressed', reason: 'do_not_contact' });

// a meeting was booked
await oseq.contacts.reportEvent(person.id, { id: calendarEventId, type: 'meeting_booked', occurred_at: new Date(start) });

// the deal closed, so take the person out of whatever sequence they are in
await oseq.enrollments.exitMany({ contact: person.id, label: 'Deal won' });
```

Reported events are idempotent by the `id` you give them, so a sync job that runs every night can resend the whole do-not-contact list safely with `oseq.contacts.reportEvents`. Treat the suppression report as mandatory. If your CRM knows someone asked not to be contacted and the engine does not, it will keep emailing them ([contact events](https://docs.opensequence.dev/docs/get-started/integrate#report-what-the-service-cannot-see)). `exitMany` needs an admin key, so call it from a background job, not from the browser path.

## Step 8. Let an agent use the same setup

The MCP server in the repository exposes the same API to Claude, Cursor or any MCP client, scoped by the key you give it. An agent can list sequences, validate a definition, preview and enroll contacts, read a contact's journey, work tasks and read analytics. It cannot create or publish a sequence, and the one-active-sequence rule applies to agents too, so a duplicate enrollment fails the same way it does for a rep. The server marks every enrollment it makes with `enrolled_by_kind: 'agent'`, so your audit trail shows which ones an agent made.

## What you still build yourself

OpenSequence has no user interface. The engine and the calls above are the easy part. The screens are yours:

| Screen | What it needs | Our estimate |
|---|---|---|
| Mailbox connection in settings | Step 1 route, readiness badge | 4 hours |
| Enroll dialog | sequence picker, preview, conflicts, dry run | 12 hours |
| Activity on the timeline | Step 5 handler, rendering per kind | 12 hours |
| Task inbox | list, outcome buttons, skip | 16 hours |
| "In a sequence" badge on lists | `contacts.statuses` for up to 500 ids | 4 hours |
| Sequence report | `analytics.summary` per sequence | 8 hours |

That is about 56 hours for an engineer who knows your CRM, plus the [install](https://docs.opensequence.dev/docs/self-hosting/install). The numbers are our estimate, not a measurement, and the enroll dialog and the task inbox are the two most likely to run over. Our [Outreach vs Salesloft cost breakdown](/blog/outreach-vs-salesloft-cost) puts those hours next to per-seat prices for a 15-rep team.

Buying is the better choice when reps need a sequence editor and dashboards on day one, when your team sends from Microsoft 365, since OpenSequence cannot sign in to Microsoft 365 mailboxes today, or when nobody owns the CRM codebase. Building the engine itself is a different and much larger job. Our guide to [what breaks when you build your own sequencer](/blog/build-your-own-sales-sequencer) covers it. If you are moving off a tool you already use, the [migration guide](/blog/replace-your-sales-sequencing-software) covers running both while contacts finish their old sequences.

## FAQ

### Can I add email sequences to a custom CRM without building the engine?

Yes. Run a sequencing engine with an API next to your CRM, push contacts and enrollments to it, and receive webhooks back. OpenSequence is one open source option. It sends from each rep's own mailbox and handles timing, caps, threading and reply detection, so your code only needs the screens and the sync.

### Does the CRM need to store sequence data?

Only what you show. Contacts are keyed by your own id, so you never store an OpenSequence contact id. Most teams keep a sequence status on the person and an activity row per webhook event, and read anything else, such as a full journey, from the API when a rep opens it.

### How do I stop a sequence when a deal changes stage?

Either call `exitMany` with the contact from the code that changes the stage, or patch the stage into the contact's `attrs` and let a condition node in the sequence branch on it. The first stops the sequence at once. The second lets the sequence decide, for example by skipping the call task for deals already in proposal.

### Can I use this with Attio or HubSpot instead of my own CRM?

Yes, as long as you have an app or a job that calls the API. The steps are the same: sync people, enroll from your app, write events back. OpenSequence also reads Attio directly. Conditions can branch on the person, company and open deal in Attio at the moment they run ([connect Attio](https://docs.opensequence.dev/docs/modules/crm/attio)).

### Will emails come from the rep's own address?

Yes. Each email goes out through the rep's own mail server over SMTP, and the engine files a copy in their Sent folder, so replies land in their inbox. Follow-ups with `reply_in_thread` stay in the same thread.
