---
title: "Customer success sequences for onboarding and renewals"
h1: "Customer success sequences: onboarding check-ins and renewal outreach that react to the product"
description: "How to run onboarding and renewal email sequences from the account owner's inbox, branch on what the customer did in your product, and hand the rest to a call."
date: 2026-11-10
updated: 2026-11-10
author: Leo Guerberg
tags: [customer-success, onboarding, renewals, sequences]
keyword: "customer success email sequences"
kind: guide
---

A customer success sequence is a short series of personal emails, texts and call tasks from the account owner to one customer, timed around a moment such as a kickoff or a renewal date. Unlike a lifecycle email, it comes from a person and stops when the customer answers. Unlike a reminder in a CSM's calendar, it runs on its own and checks what the customer actually did before it sends the next step.

This guide covers the two sequences most customer success teams run, onboarding and renewal, and how to build them so they react to your product data. The examples use OpenSequence, an open source sequence engine; [what an outreach sequence is](/blog/what-is-an-outreach-sequence) covers the basics.

## Lifecycle email or a CS sequence?

Most products already send onboarding email through a lifecycle platform such as Customer.io or Braze: a welcome email, feature tips, a nudge when someone stalls. Those go to every user, from a brand address.

A CS sequence is for the accounts where a person owns the relationship. It goes to the decision maker, from their account manager's mailbox, and its job is to start a conversation: book a check-in, find a blocker, get a renewal call on the calendar. The two run side by side. We wrote about [where Customer.io fits for one-to-one outreach](/blog/customer-io-for-sales-sequences) and where it does not.

## An onboarding sequence that checks activation

The point of an onboarding check-in is to help customers who are stuck. Customers who already set up the product do not need a "how is it going" email; they need to be left alone. So the sequence branches on an activation flag your product keeps up to date:

```json
{
  "entry": "welcome",
  "exit_on": ["reply", "meeting_booked"],
  "nodes": {
    "welcome": {
      "type": "outreach",
      "channel": "email",
      "action": "send",
      "params": {
        "subject": "Your first week with Acme",
        "body": "Hi {{ contact.first_name }}, I'm your account manager…"
      },
      "next": { "sent": "wait" }
    },
    "wait": { "type": "wait", "params": { "duration": "3bd" }, "next": { "then": "activated" } },
    "activated": {
      "type": "condition",
      "params": { "mode": "all", "rules": [{ "field": "attrs.activated", "op": "is_true" }] },
      "next": { "yes": "done", "no": "check_in" }
    },
    "check_in": {
      "type": "outreach",
      "channel": "email",
      "action": "send",
      "params": {
        "subject": "Re: Your first week with Acme",
        "body": "…",
        "reply_in_thread": true
      },
      "next": { "sent": "wait_2" }
    },
    "wait_2": { "type": "wait", "params": { "duration": "2bd" }, "next": { "then": "call" } },
    "call": {
      "type": "task",
      "params": {
        "kind": "call",
        "title": "Onboarding call with {{ contact.first_name }}",
        "due": "1bd"
      }
    },
    "done": { "type": "end", "params": { "label": "activated" } }
  }
}
```

Your product keeps the flag current with one call when the customer reaches the milestone that matters, such as the first integration connected or the first report sent:

```ts
await oseq.contacts.patch(account.ownerId, { attrs: { activated: true } });
```

The condition reads the value at the moment the step runs, and the run records the value it saw, so you can tell later why a customer got the call or did not.

## A renewal sequence that starts on time

Renewal outreach fails in a predictable way: it starts too late, or a CSM with 80 accounts forgets one. A sequence fixes both. Your app enrolls each account a fixed number of days before its renewal date, from a daily job:

```ts
const due = await db.accounts.renewingInDays(60);
for (const account of due) {
  await oseq.contacts.upsert(account.champion.id, {
    first_name: account.champion.firstName,
    email: account.champion.email,
    phone: account.champion.phone,
    attrs: { plan: account.plan, seats: account.seats, renewal_date: account.renewalDate },
  });
  await oseq.sequences.enroll(SEQ_RENEWAL, {
    contacts: [account.champion.id],
    sender: account.ownerId,
  });
}
```

The sequence itself: an email offering a review call, a `wait_for` that waits five business days for a reply, then a call task, then a short text if the contact has SMS consent. Templates can use the account's details, such as `{{ attrs.seats }}`, so every message is specific without a CSM writing it.

If the sequence is set to `reenroll: "after_90d"` or `never`, running the job daily is safe: an account already in the sequence is skipped.

## Report what the engine cannot see

The engine sees replies to its own emails and texts. It cannot see a meeting booked in your calendar tool or a renewal signed in your billing system, so your app reports them, and the sequence stops:

```ts
await oseq.contacts.reportEvent(champion.id, { id: booking.id, type: 'meeting_booked' });
```

Treat this as required. A customer who already booked the renewal call and still gets "just following up" emails is a worse outcome than no sequence at all.

## FAQ

### What should a customer onboarding email sequence include?

A welcome from the account owner with one clear next step, a check on whether the customer reached the first milestone, a short follow-up for those who did not, and a call task if they still have not. Customers who activated should leave the sequence early.

### When should renewal outreach start?

For annual contracts, 60 to 90 days before the renewal date gives time for a review call, a usage discussion and procurement. Smaller monthly accounts usually need no sequence at all.

### Should customer success sequences come from a person or a brand address?

From a person, for accounts someone owns. The goal is a reply or a meeting, and people answer people. Keep product tips and announcements on your lifecycle email platform.

### Can a sequence branch on product usage?

Yes. Push the facts that matter, such as an activation flag, the plan or the seat count, into the contact's attributes, and use a condition step to branch on them. Keep the facts up to date from the code that changes them.
