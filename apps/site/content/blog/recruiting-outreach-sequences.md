---
title: "Recruiting outreach sequences from your own ATS"
h1: "Recruiting outreach sequences: automate candidate follow-ups from your own ATS"
description: "How to automate candidate outreach from a recruiter's own inbox: a sample sequence, ATS sync with webhooks, LinkedIn steps, and stopping on a reply."
date: 2026-11-10
updated: 2026-11-10
author: Leo Guerberg
tags: [recruiting, sequences, ats, tutorial]
keyword: "recruiting outreach sequences"
kind: guide
---

A recruiting outreach sequence is a series of personal emails and LinkedIn steps sent to one candidate from the recruiter's own inbox, which stops the moment the candidate replies. Most candidates do not answer the first message, so the follow-ups are where the replies come from. The risk is the opposite mistake: a follow-up that lands after the candidate already said yes, or no.

This guide shows how to run candidate sequences from inside your own applicant tracking system (ATS) or recruiting tool, using OpenSequence, an open source sequence engine. If you are new to the idea, start with [what an outreach sequence is](/blog/what-is-an-outreach-sequence).

## Why recruiters sequence differently from sales

The mechanics are the same as sales outreach, but three things matter more:

- **The sender is a person candidates will check.** A message from a shared `talent@` address reads as a mass mailing. Sending from the recruiter's own mailbox, with follow-ups in the same thread, reads as a person.
- **Replies have to reach the ATS.** If a candidate answers and the ATS does not know, someone else on the team will contact them again. Several recruiting tools still keep sequence emails outside the ATS.
- **Candidates are often on LinkedIn, not email.** A sequence needs a LinkedIn step, and LinkedIn forbids automating connection requests, so that step has to be a task the recruiter does by hand.

## A sample candidate sequence

Five touches over about three weeks, from the recruiter:

| Day               | Step                                                 | Notes                                       |
| ----------------- | ---------------------------------------------------- | ------------------------------------------- |
| 0                 | Email: the role in two sentences, why them           | From the recruiter's mailbox                |
| 3 (business days) | Follow-up in the same thread                         | Short, one new detail about the team        |
| 4                 | LinkedIn connection request with a note              | A task: the recruiter sends it in one click |
| 8                 | Email: a different angle, such as the hiring manager | Same thread                                 |
| 15                | Last email, leaving the door open                    | Ends the sequence                           |

The sequence exits on any reply. As JSON:

```json
{
  "entry": "intro",
  "exit_on": ["reply", "meeting_booked"],
  "settings": {
    "send_window": {
      "days": ["mon", "tue", "wed", "thu", "fri"],
      "from": "09:00",
      "to": "17:00",
      "tz": "contact"
    }
  },
  "nodes": {
    "intro": {
      "type": "outreach",
      "channel": "email",
      "action": "send",
      "params": {
        "subject": "{{ attrs.role | \"A role\" }} at Acme",
        "body": "Hi {{ contact.first_name }}, …"
      },
      "next": { "sent": "wait_1" }
    },
    "wait_1": { "type": "wait", "params": { "duration": "3bd" }, "next": { "then": "bump" } },
    "bump": {
      "type": "outreach",
      "channel": "email",
      "action": "send",
      "params": {
        "subject": "Re: {{ attrs.role | \"A role\" }} at Acme",
        "body": "…",
        "reply_in_thread": true
      },
      "next": { "sent": "li" }
    },
    "li": {
      "type": "linkedin_connect",
      "params": {
        "note": "Hi {{ contact.first_name }}, I sent you a note about {{ attrs.role | \"a role\" }} at Acme. Happy to connect.",
        "expire": "5bd"
      },
      "next": { "completed": "wait_2", "no_answer": "wait_2", "skipped": "wait_2" }
    },
    "wait_2": { "type": "wait", "params": { "duration": "4bd" }, "next": { "then": "angle" } },
    "angle": {
      "type": "outreach",
      "channel": "email",
      "action": "send",
      "params": {
        "subject": "Re: {{ attrs.role | \"A role\" }} at Acme",
        "body": "…",
        "reply_in_thread": true
      },
      "next": { "sent": "wait_3" }
    },
    "wait_3": { "type": "wait", "params": { "duration": "5bd" }, "next": { "then": "last" } },
    "last": {
      "type": "outreach",
      "channel": "email",
      "action": "send",
      "params": {
        "subject": "Re: {{ attrs.role | \"A role\" }} at Acme",
        "body": "…",
        "reply_in_thread": true
      }
    }
  }
}
```

The LinkedIn step renders the note for each candidate and gives the recruiter a task with the profile link. Opening the task marks it sent. Candidates without a LinkedIn URL skip it ([LinkedIn module](https://docs.opensequence.dev/docs/modules/linkedin)).

## Wiring it into your ATS

Your ATS keeps candidates, jobs and pipelines. The engine keeps the sequences. Four integration points connect them.

**1. Each recruiter connects their mailbox once.** From your settings page, save their SMTP and IMAP login as a sender. The engine checks both logins before storing them, encrypted.

**2. A "Start outreach" button enrolls the candidate.** Upsert the candidate by your own id, with the role in `attrs`, then enroll:

```ts
await oseq.contacts.upsert(candidate.id, {
  first_name: candidate.firstName,
  email: candidate.email,
  linkedin_url: candidate.linkedinUrl,
  attrs: { role: job.title, stage: 'sourced' },
});
await oseq.sequences.enroll(SEQ_SOURCING, { contacts: [candidate.id], sender: recruiter.id });
```

**3. Webhooks write back to the candidate's timeline.** Subscribe to `run.done` (a message went out), `signal.received` (a reply arrived) and `enrollment.exited`. A reply moves the candidate to "Responded" in your pipeline.

**4. Your ATS stops the sequence when the candidate moves on.** When a recruiter moves a candidate to a later stage, or another recruiter already reached them, exit the enrollment:

```ts
await oseq.enrollments.exitMany({ contact: candidate.id, label: 'Moved to interview' });
```

The [integration checklist](https://docs.opensequence.dev/docs/get-started/integrate) lists the full set of calls.

## What to measure

Reply rate per step tells you which messages earn answers. The analytics endpoints credit each reply to one touch, so a reply to the third email does not also count for the first. Compare sequences per role family; engineering candidates and sales candidates respond to very different openers.

## FAQ

### Can I automate recruiting outreach without it feeling automated?

Yes, if each message comes from the recruiter's own mailbox, follow-ups stay in the same thread, and the sequence stops the moment the candidate answers. Personalise the first line from what you know about the candidate, and keep follow-ups short.

### Can a recruiting sequence send LinkedIn messages automatically?

No, and it should not. LinkedIn's terms forbid automating connection requests. A good sequence renders the note and gives the recruiter a task with the profile link, so sending takes one click.

### How do I stop a sequence when a candidate is hired or rejected?

Exit the enrollment from the code that changes the candidate's stage, or store the stage in the contact's attributes and add a condition step that ends the sequence when the stage is no longer "sourced".

### Is there an open source tool for recruiting sequences?

OpenSequence is open source (Apache-2.0) and has no sales-specific fields, so it runs candidate sequences the same way it runs any other. It is an engine with an API, so it fits teams that have their own ATS or recruiting product.
