---
title: "What is an outreach sequence? Steps, rules and examples"
h1: "What is an outreach sequence? The steps, the stop rules, and five examples"
description: "An outreach sequence is a series of one-to-one emails, texts and tasks that stops when the person replies. How they work, the parts, and examples for five teams."
date: 2026-11-10
updated: 2026-11-10
author: Leo Guerberg
tags: [sequences, outreach, sales-engagement, recruiting, customer-success]
keyword: "what is an outreach sequence"
kind: guide
---

An outreach sequence is a planned series of one-to-one messages and tasks sent to one person over days or weeks: for example an email, a two-day wait, a follow-up in the same thread, then a call. It runs on its own once the person is enrolled, and it stops by itself when they reply, book a meeting, bounce or opt out. Sales teams call it a cadence; recruiters, customer success managers and founders run the same thing under other names.

This page explains the parts every sequence has, the rules that make one safe to run, and five examples from different teams. We build [OpenSequence](/), an open source sequence engine, so the examples use its JSON format, but the ideas apply to any tool.

## Sequence, campaign, drip: what is the difference

The three words get mixed up, and the difference matters when you pick a tool.

|                   | Outreach sequence                        | Email campaign          | Drip or lifecycle flow                     |
| ----------------- | ---------------------------------------- | ----------------------- | ------------------------------------------ |
| Who it goes to    | One person at a time, chosen by someone  | A list, all at once     | Everyone who did something in your product |
| Who it comes from | A named person's own mailbox             | A brand address         | A brand address                            |
| Channels          | Email, SMS, calls, LinkedIn tasks        | Email                   | Email, push, in-app                        |
| What stops it     | A reply, a meeting, a bounce, an opt-out | Nothing, it is one send | Leaving the segment                        |
| Typical tool      | Outreach, Apollo, lemlist, OpenSequence  | Mailchimp               | Customer.io, Braze                         |

The short version: a campaign broadcasts, a drip reacts to product behaviour, and a sequence starts a conversation and gets out of the way once the conversation starts.

## The parts of a sequence

Every sequence, in every tool, is built from the same five kinds of step.

1. **Send.** An email or a text, rendered from a template with the contact's details, sent from the sender's own mailbox or number.
2. **Wait.** A fixed delay, such as two business days, or a wait for an event, such as a reply, with a timeout.
3. **Condition.** A branch on what you know about the contact: their country, whether they have a phone number, their plan, their deal stage, what happened on the last call.
4. **Task.** A step a human does: a call, a LinkedIn connection request, a handwritten note. The sequence waits for the outcome and branches on it.
5. **End.** The sequence finishes, with a label you can report on.

In OpenSequence a sequence is a JSON document with one entry per step and named transitions between them:

```json
{
  "entry": "intro",
  "exit_on": ["reply", "meeting_booked"],
  "nodes": {
    "intro": {
      "type": "outreach",
      "channel": "email",
      "action": "send",
      "params": { "subject": "Quick question", "body": "Hi {{ contact.first_name }}, …" },
      "next": { "sent": "wait" }
    },
    "wait": { "type": "wait", "params": { "duration": "2bd" }, "next": { "then": "bump" } },
    "bump": {
      "type": "outreach",
      "channel": "email",
      "action": "send",
      "params": { "subject": "Re: Quick question", "body": "…", "reply_in_thread": true },
      "next": { "sent": "call" }
    },
    "call": {
      "type": "task",
      "params": { "kind": "call", "title": "Call {{ contact.first_name }}", "due": "1bd" }
    }
  }
}
```

## The rules that make a sequence safe

The steps are the easy part. These rules are what separate a sequence from a script that emails people on a timer:

- **Stop on a reply.** The moment the person answers, on any channel, the sequence ends. Matching has to use the email thread, not the subject line, or people who replied keep getting follow-ups.
- **Stop on an opt-out or a bounce,** and never contact that address on that channel again.
- **Respect the contact's clock.** Send inside working hours in the contact's time zone, not the sender's.
- **Cap each sender.** A daily limit and a gap between sends keep a mailbox out of spam folders. Our guide to [cold email deliverability](/blog/cold-email-deliverability-self-hosted) has the numbers.
- **Send each step once.** A crash between sending and saving must not turn into a second email.
- **Pin the version.** Editing a sequence should not change what people already halfway through it receive.

## Five examples from five teams

**Sales prospecting.** Email, wait two business days, follow up in thread, LinkedIn connection request, call task, final email. Exits on reply or a booked meeting.

**Recruiting.** Email from the recruiter, wait three business days, follow-up in thread, LinkedIn request, last email a week later. Exits on reply, and the reply goes to the applicant tracking system. See [recruiting outreach sequences](/blog/recruiting-outreach-sequences).

**Customer onboarding.** Welcome email from the account owner, wait two days, check whether the customer activated, then either end or create a call task. See [customer success sequences](/blog/customer-success-sequences).

**Renewals.** Email 60 days before the renewal date, wait for a reply for five business days, then a call task, then a text. Exits on a booked meeting.

**AI agents.** The agent decides who to contact and drafts the copy; the sequence engine sends it, follows up and stops on a reply. See [a sequencing backend for AI SDR agents](/blog/ai-sdr-sequencing-backend).

## Where sequences run

Most teams run sequences in a sales engagement tool such as Outreach, Salesloft, Apollo or lemlist, priced per seat. Teams that want sequences inside their own CRM, ATS or product use a sequence API instead: [what an email sequence API does](/blog/email-sequence-api) covers that route, and [how to build a sequencing tool](/blog/build-your-own-sales-sequencer) covers building one yourself.

## FAQ

### What is an outreach sequence?

An outreach sequence is a series of one-to-one emails, texts and tasks, such as calls or LinkedIn requests, sent to one person over days or weeks from a real sender. It runs automatically after enrollment and stops when the person replies, books a meeting, bounces or opts out.

### How many steps should a sequence have?

Most outbound sequences have four to eight touches over two to four weeks. Onboarding and renewal sequences are usually shorter, three to five touches, because the person already knows you. Measure replies per step and cut the steps that never earn one.

### What is the difference between a sequence and a cadence?

None in practice. Cadence is the older sales word, used by Salesloft among others; sequence is the word Outreach, HubSpot and most newer tools use. Both mean a timed series of touches to one person that stops on a reply.

### Can a sequence include phone calls and LinkedIn?

Yes, as tasks. The sequence creates a task for the sender, waits for the outcome, and branches on it. LinkedIn does not allow automated connection requests, so a LinkedIn step is a task the sender completes by hand, usually in one click.
