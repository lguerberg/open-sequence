---
title: "A sequencing backend for AI SDR agents"
h1: "AI SDR agents need a sequencing backend: what the agent decides and what the engine owns"
description: "Split an AI SDR into an agent that picks who to contact and what to say, and a sequence engine that sends, follows up and stops on a reply. With MCP and scoped keys."
date: 2026-11-10
updated: 2026-11-10
author: Leo Guerberg
tags: [ai-agents, mcp, ai-sdr, sequences]
keyword: "AI SDR"
kind: guide
---

An AI SDR is an agent that researches prospects, writes outreach and follows up. The research and the writing are what language models are good at. The sending, timing, follow-ups and stop rules are not: they need to be exact, the same every time, and correct after a crash. The reliable design splits the job in two. The agent decides who to contact and what to say. A sequence engine sends it, waits, follows up, and stops the moment someone replies.

This guide shows that split using OpenSequence, an open source sequence engine with an MCP server. The same pattern works for agents doing recruiting or customer success outreach.

## What goes wrong when the agent sends

Teams that let an agent send email directly, through a mail API and a loop, hit the same problems:

- **Duplicates.** The agent retries a tool call after a timeout, and the prospect gets the same email twice.
- **Follow-ups after a reply.** The agent's next run does not know the prospect answered yesterday, because reply detection was never built.
- **Wrong hours.** The agent runs at 03:00 UTC and sends then, which is the middle of the night for half the list.
- **No caps.** One enthusiastic run sends 400 emails from one mailbox, and the domain lands in spam.
- **No audit trail.** Nobody can say why a prospect got the third email.

These are the [hard parts of a sequencing tool](/blog/build-your-own-sales-sequencer), and none of them is a reasoning problem.

## The split

| The agent decides                               | The engine owns                                        |
| ----------------------------------------------- | ------------------------------------------------------ |
| Which contacts to target, and why               | When each step goes out, in the contact's time zone    |
| Which sequence fits each contact                | Sending from the sender's mailbox, under a daily cap   |
| The personal first line, stored as an attribute | Follow-ups in the same thread                          |
| Whether to enroll now or wait                   | Stopping on a reply, a bounce, an opt-out or a meeting |
| What to do with a reply                         | Sending each step exactly once, even after a crash     |

The sequence itself is written and reviewed by a person, once. The agent fills it with judgment, contact by contact.

## Connect the agent through MCP

OpenSequence ships an MCP server, so Claude Code, Cursor or any MCP client can use the API as tools. Connect it with a project key:

```bash
claude mcp add --transport http opensequence https://mcp.example.com/mcp \
  --header "Authorization: Bearer sk_live_..."
```

The key's scopes decide what the agent can do, not the prompt. A key with the `enroll` scope can call `upsert_contact`, `preview_enrollment` and `enroll_contacts`, and read journeys and analytics. It cannot edit sequences, connect senders or change settings; those calls come back refused. That is the guardrail: an agent can choose who goes into a sequence, but not rewrite what the sequence sends.

## The agent's loop

1. **Research and pick.** The agent reads your CRM or a lead list and chooses contacts that fit.
2. **Write the personal part.** It writes one opening line per contact and stores it, with anything else it found, in the contact's attributes through `upsert_contact`. The sequence's first email uses `{{ attrs.opener }}`.
3. **Preview.** `preview_enrollment` returns who would be enrolled, when their first touch would go out, and who would be skipped and why: already in the sequence, opted out, no email address.
4. **Enroll.** `enroll_contacts` with the sender. From here the engine owns the timing.
5. **Read results.** `get_enrollment_journey` shows every step that ran and the branch it took; the analytics tools show reply rates per step. The agent can use them to choose better next time.

The same calls are available from code with the [TypeScript SDK](https://docs.opensequence.dev/sdks/typescript), if your agent runs as a service rather than in an MCP client.

## Handle replies with a person in the loop

When someone replies, the engine exits the enrollment and sends a signed `signal.received` webhook with the reply. What happens next is a decision: answer, book a meeting, hand over to a rep. Many teams let the agent draft the answer and a person send it. Either way, the follow-up email that would have gone out tomorrow never does, because the sequence already stopped.

## FAQ

### What is an AI SDR?

An AI SDR is a software agent that does the work of a sales development rep: finding prospects, researching them, writing personalised outreach and following up. Most combine a language model for research and writing with a sending system for delivery.

### Should an AI agent send emails directly?

It is safer not to. Give the agent a tool that enrolls contacts into a reviewed sequence, and let a sequence engine handle sending, timing, caps, follow-ups and stopping on a reply. The agent then cannot send duplicates or keep following up after someone answered.

### How do I stop an agent from changing what gets sent?

Use a key with limited scopes. In OpenSequence, an `enroll` key can add contacts and enroll them but cannot edit sequences, senders or settings, and the API enforces it whatever the prompt says.

### Does this work for recruiting or customer success agents?

Yes. The engine has no sales-specific fields. A recruiting agent enrolls candidates into a candidate sequence, and a customer success agent enrolls accounts into a renewal sequence, with the same tools and the same guardrails.
