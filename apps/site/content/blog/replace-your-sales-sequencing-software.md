---
title: "Replace your sales engagement platform: a migration guide"
h1: "How to move off Outreach, Salesloft, Apollo or lemlist without double-sending anyone"
description: "Replace a sales engagement platform in about six weeks: what Outreach, Salesloft, Apollo and lemlist export, how to map steps, and how to cut over safely."
date: 2026-10-14
updated: 2026-10-14
author: Leo Guerberg
tags: [migration, sales-engagement, outreach, apollo]
keyword: "replace sales engagement platform"
---

To replace a sales engagement platform, export your contacts and suppression lists, rebuild each live sequence in the new system, start new contacts there while existing ones finish in the old tool, and cancel only after the longest sequence has drained. For a team of about 10 reps, plan on four to six weeks. The sequences are the easy part. The risk sits in what the old tool did without being asked: honoring unsubscribes, stopping on replies, and logging activity to the CRM.

We build OpenSequence, an open source (Apache-2.0) sequencing engine you run yourself, so this guide uses it as the destination. Most steps apply to any target, and for many teams the right call is not to move.

## Who should not move

OpenSequence is a headless engine: one container, a Postgres, and an API. It is pre-1.0, and the SDK is not on npm yet. Stay where you are if any of these is true:

- Your reps send from Microsoft 365 or Outlook. OpenSequence sends through the Gmail API only. SMTP and IMAP are on the [roadmap](https://docs.opensequence.dev/docs/community/roadmap), not in the code.
- Nobody on the team writes code. There is no UI. Someone has to build the enroll button, the task inbox and the reporting screen on the API.
- Your managers coach on open rates, click rates or A/B tests of copy. The engine has none of these. Its only outcomes are replies and meetings booked.
- You use Apollo mostly for its contact database, or lemlist mostly for lemwarm. OpenSequence is neither a prospect database nor a warm-up service.
- You need Salesforce or HubSpot sync on day one. The only CRM adapter is Attio, and it reads, it does not write. HubSpot is on the roadmap.

The teams who should move run Google Workspace, have an engineer, and want sequences inside their own CRM or product. If the reason is the bill, read [what Outreach and Salesloft actually cost](/blog/outreach-vs-salesloft-cost) or [the Apollo alternatives compared](/blog/apollo-alternatives) first.

## Inventory what you actually use

List the features your team touched in the last 90 days. A sequence with no enrollments in a quarter does not need porting.

| In the old tool | In OpenSequence | Gap |
|---|---|---|
| Sequence, cadence, campaign | A versioned JSON definition | None |
| Automatic email step | `outreach` email node | None |
| Threaded follow-up | `reply_in_thread: true` | Same enrollment only |
| Template library | Text inside the node | No shared library |
| Snippets | Constants in your code | No snippet object |
| Call step | `task` with `kind: "call"` | Dialer push is Allo only |
| LinkedIn step | `linkedin_connect` task | Manual only |
| Task queue | Tasks API | You build the inbox |
| Connected mailboxes | Senders with Google | Gmail only |
| Open and click tracking | None | Not in v1 |
| A/B test | None | `split` node planned |
| CRM activity sync | Webhooks to your code | You write the sync |

Anything in the right column that your team depends on is either work for your engineer or a reason to stay.

## What each tool lets you export

Every vendor makes contacts easy to take and sequence content harder.

| Tool | Contacts | Sequence content |
|---|---|---|
| Outreach | CSV, 100K per filtered list | API only |
| Salesloft | API | Cadence export by API |
| Apollo | CSV, credits for net-new | Copy by hand |
| lemlist | CSV or JSON by API | Steps by API |

**Outreach.** The [export overview](https://support.outreach.io/hc/en-us/articles/360038242394) lists prospects, accounts, opportunities, calls, tasks, sequence states, users and emails as exportable. Instant downloads stop at 200 records, larger exports arrive by email, and a filtered list caps at 100K. The same page says "Templates and Snippets cannot be exported." The REST API does expose `sequences`, `sequenceSteps`, `sequenceTemplates`, `templates` and `snippets` ([common patterns](https://developers.outreach.io/api/common-patterns)), so a script can pull the content the UI will not give you. Export `sequenceStates` too. It tells you who is mid-sequence on cutover day.

**Salesloft.** People come out through [`GET /v2/people`](https://developers.salesloft.com/docs/api/people-index/). `POST /v2/cadence_export_downloads` ([docs](https://developer.salesloft.com/docs/api/cadence-export-downloads-create/)) requests an export of the cadences the user can see. It runs asynchronously and the file arrives by email, not in the response. The [cadence import docs](https://developer.salesloft.com/docs/platform/cadence-imports/introduction/) show the JSON shape: steps nested under `cadence_content.step_groups[].steps[]`.

**Apollo.** Exporting saved contacts to CSV costs no credits. Exporting net-new contacts does ([Apollo help center](https://knowledge.apollo.io/hc/en-us/articles/4409237712141-Export-Contacts-to-a-CSV)). For sequences, the [search endpoint](https://docs.apollo.io/reference/search-for-sequences) needs a master API key and a paid plan, and it returns a step count, not the steps. Plan to copy step text by hand.

**lemlist.** The API exports a campaign's leads as CSV or JSON, filtered by state ([export leads](https://developer.lemlist.com/api-reference/endpoints/campaigns/export-campaign-leads-v2)). The states include `emailsUnsubscribed` and `emailsBounced`, which is your suppression list. `GET /campaigns/{campaignId}/sequences` ([docs](https://developer.lemlist.com/api-reference/endpoints/sequences/get-campaign-sequences)) returns every step with its `type`, `delay` in days, `subject` and HTML `message`. lemlist is the easiest of the four to convert with a script.

## Map sequences to definitions

The mapping is mechanical. Each email becomes an `outreach` node, each delay a `wait`, each call or LinkedIn step a `task`, and "stop on reply" becomes `exit_on`. The sending schedule becomes `settings.send_window`. Merge fields become template paths such as `{{ contact.first_name | "there" }}`, and custom fields move into the contact's `attrs`.

Three rules will catch you the first time. `contact.first_name`, `contact.last_name` and `contact.email` must carry a fallback or the publish fails with `BAD_TEMPLATE`. An email body without `{{ unsubscribe_url }}` publishes with the warning `NO_UNSUBSCRIBE`. Templates have no logic at all: no conditionals, no loops, only paths and fallbacks. Any branching moves into a `condition` node.

Here is a typical five-touch Outreach sequence after translation. Snippets became a constant.

```ts
import { OpenSequence } from '@opensequence/sdk';

const oseq = new OpenSequence({ baseUrl: process.env.SEQ_URL!, apiKey: process.env.SEQ_KEY! });

// What used to be an Outreach snippet
const signoff = '{{ sender.first_name }}\n\nNot for you? {{ unsubscribe_url }}';

const definition = {
  schema_version: 1,
  entry: 'email_1',
  settings: {
    send_window: { days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '08:00', to: '17:00', tz: 'contact' },
    jitter: '15m',
    reenroll: 'never',
  },
  exit_on: ['reply', 'meeting_booked'],
  nodes: {
    email_1: {
      type: 'outreach', channel: 'email', action: 'send',
      params: {
        subject: 'Outbound at {{ attrs.company.name | "your team" }}',
        body: `Hi {{ contact.first_name | "there" }},\n\n…\n\n${signoff}`,
      },
      next: { sent: 'wait_1', skipped: 'wait_1' },
    },
    wait_1: { type: 'wait', params: { duration: '2bd' }, next: { then: 'email_2' } },
    email_2: {
      type: 'outreach', channel: 'email', action: 'send',
      params: { subject: 'Re: outbound', body: `…\n\n${signoff}`, reply_in_thread: true },
      next: { sent: 'call_1', skipped: 'call_1' },
    },
    call_1: {
      type: 'task',
      params: { kind: 'call', title: 'Call {{ contact.first_name | "them" }}', due: '2bd', expire: '4bd' },
      next: { completed: 'has_li', no_answer: 'has_li' },
    },
    has_li: {
      type: 'condition',
      params: { mode: 'all', rules: [{ field: 'contact.has_linkedin', op: 'is_true' }] },
      next: { yes: 'li_1', no: 'wait_2' },
    },
    li_1: {
      type: 'task',
      params: { kind: 'linkedin_connect', title: 'Connect with {{ contact.first_name | "them" }}', link: '{{ contact.linkedin_url }}', due: '1bd' },
      next: { completed: 'wait_2', no_answer: 'wait_2' },
    },
    wait_2: { type: 'wait', params: { duration: '3bd' }, next: { then: 'email_3' } },
    email_3: {
      type: 'outreach', channel: 'email', action: 'send',
      params: { subject: 'Closing the loop', body: `Hi {{ contact.first_name | "there" }}, last note from me.\n\n${signoff}` },
      next: { sent: 'end', skipped: 'end' },
    },
    end: { type: 'end' },
  },
};

const { ok, problems } = await oseq.sequences.validate(definition);
if (!ok) throw new Error(JSON.stringify(problems));

const { sequence, version } = await oseq.sequences.create({ name: 'VP Sales outbound', definition });
await oseq.sequences.versions.publish(sequence.id, version.id);
```

A connected call counts as a reply, so `exit_on: ['reply']` ends the flow when a rep gets through. `2bd` means two business days in the contact's zone, without holidays. The full grammar is in [the definition reference](https://docs.opensequence.dev/docs/sequences/definition). Commit the file. From here on, a sequence change is a pull request, and published versions are immutable, so contacts already enrolled finish on the version they started.

## Mailboxes and warm-up continuity

If your reps connected Google Workspace mailboxes to Outreach or Salesloft, nothing needs re-warming. OpenSequence sends through the [same Gmail accounts by OAuth](https://docs.opensequence.dev/docs/senders/connect-google), from the same domain, with the same reputation. You do need your own Google OAuth client. Gmail scopes are sensitive, and an app used by accounts outside your Workspace domain needs Google's verification before the consent screen stops warning users.

The trap is combined volume during the parallel run. OpenSequence's `daily_limit` (30 emails by default, with a 60 second minimum gap) counts only its own sends. It cannot see what Outreach sent from the same mailbox an hour earlier. If a rep sent 50 a day before, split that budget. Put 35 in the old tool and 15 in OpenSequence in week one, then move the numbers as the old sequences drain. Google's hard ceiling is [2,000 messages a day per Workspace user](https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace), and a cold outbound mailbox should stay far below it.

Secondary domains warmed by lemwarm or another warm-up service are a different case. OpenSequence does not warm anything, so keep the warm-up service on those mailboxes or retire them. Confirm they are Google Workspace mailboxes before you plan around them.

Google's [sender guidelines](https://support.google.com/a/answer/81126) require SPF, DKIM, DMARC and one-click unsubscribe above 5,000 messages a day to Gmail, and a spam rate below 0.30% (0.10% is the target). OpenSequence adds `List-Unsubscribe` and `List-Unsubscribe-Post` headers to every email. The rest is DNS, covered in [cold email deliverability when you self-host](/blog/cold-email-deliverability-self-hosted).

## Run both systems without double-sending

On any given day, a contact lives in exactly one system. OpenSequence refuses to enroll a contact who is already in one of its sequences (`409 ALREADY_IN_SEQUENCE`), but it cannot see Outreach. Your enroll code has to check the old tool too.

Drain the old tool instead of moving people. On cutover day, new enrollments go to OpenSequence only, and contacts already in an old sequence finish there. Remove the old tool's "add to sequence" permission so nobody enrolls from habit.

Load suppressions before the first send. Suppressions are never removed through the API, so get the list right.

```ts
// rows: unsubscribes and bounces exported from the old tool, keyed by your CRM id
for (let i = 0; i < rows.length; i += 500) {
  const chunk = rows.slice(i, i + 500);
  await oseq.contacts.batch(chunk.map((r) => ({ external_id: r.crmId, email: r.email })));
  await oseq.contacts.reportEvents(chunk.map((r) => (
    r.unsubscribed
      ? { contact: r.crmId, id: `import-optout-${r.crmId}`, type: 'opt_out', channel: 'email' }
      : { contact: r.crmId, id: `import-bounce-${r.crmId}`, type: 'suppressed', reason: 'invalid_email' }
  )));
}
```

Event ids make the import idempotent, so a rerun after a crash changes nothing. The [contact events page](https://docs.opensequence.dev/docs/contacts/events) lists every type.

Watch replies to old threads. OpenSequence detects replies only in threads it started. A prospect who answers an Outreach email from three weeks ago is invisible to it. While both systems run, forward any such reply as a `reply` event, or that contact keeps getting follow-ups.

Sometimes contacts must move mid-sequence, because the contract ends before the drain does. In that case, export their sequence state, finish them in the old tool, and enroll them in a second published sequence whose `entry` is the step they had reached. Its first email cannot thread onto the old one, because `reply_in_thread` only threads within the same enrollment. Write that email so it reads well as a fresh message.

Rehearse with `mode: "dry_run"` first. Email and text steps are recorded with their rendered text instead of sent, while waits, conditions and tasks run for real ([enrolling](https://docs.opensequence.dev/docs/enrollments/enrolling)).

## CRM sync

Outreach and Salesloft write activities into your CRM. OpenSequence writes nothing. You subscribe to [signed webhooks](https://docs.opensequence.dev/docs/webhooks/overview) and write what you want: `run.done` for a sent step, `signal.received` for replies, meetings and bounces, `enrollment.exited` with the reason, and `task.created` for your task inbox. Deliveries retry for three days and can arrive twice, so make the handler idempotent on the event `id`.

The other direction matters more. Your CRM has to push do-not-contact flags, meetings booked in other tools, and deleted contacts back to OpenSequence. The engine never reads your database. If you skip this, it keeps emailing people your reps already excluded.

## Reporting parity

Open and click rates do not carry over. OpenSequence counts [replies and meetings](https://docs.opensequence.dev/docs/analytics/outcomes), each attributed once per enrollment to the touch that earned it, within a 14 day window. It reports them per 100 enrolled and per 100 delivered, by sequence, step and channel.

Each vendor defines "reply rate" its own way, so do not compare dashboards. Before cancelling, export the old sequence stats and recompute replies per 100 enrolled for your top five sequences. Compare against that baseline after a month of sends.

## Cutover checklist

1. Confirm every sending mailbox is Google Workspace.
2. Export contacts, sequence states, step content and stats from the old tool.
3. Export unsubscribes, bounces and complaints, and load them as suppressions.
4. Deploy OpenSequence, register the Google OAuth client, and connect each sender.
5. Translate the live sequences, validate them, and run one dry-run enrollment each.
6. Build the webhook handler that writes activity to the CRM.
7. Build the task inbox for call and LinkedIn steps.
8. Add the old-tool check to your enroll code.
9. Split each mailbox's daily volume between the two systems.
10. Pilot with two reps on new contacts only.
11. Switch all new enrollments, and remove enroll rights in the old tool.
12. Forward replies on old threads as `reply` events until the drain ends.
13. Record baseline reply and meeting rates.
14. Cancel after the last old sequence finishes, and keep the exports.

## A realistic timeline

This is our estimate for a team of about 10 reps with one engineer half time and sequences no longer than three weeks. It is not a measured benchmark.

| Week | Work |
|---|---|
| 1 | Inventory, exports, deploy, OAuth client, two pilot senders |
| 2 | Translate sequences, dry runs, suppressions, CRM webhook handler, task inbox |
| 3 | Pilot: two reps enroll new contacts in OpenSequence |
| 4 | All new enrollments move; the old tool drains |
| 5 and 6 | Drain ends, baseline check, cancel |

The UI work in week 2 grows with every screen your reps expect, and the drain lasts as long as your longest active sequence. Check your contract's notice period in week 1, because a missed auto-renewal date can lock you in for another term. If you are weighing building the engine yourself instead, [what it takes to build your own sales sequencer](/blog/build-your-own-sales-sequencer) covers that path.

## FAQ

### Can I import Outreach sequences into OpenSequence automatically?

There is no built-in importer. Outreach's API exposes sequences, steps and templates, so a short script can turn them into definitions, and the mapping is mechanical. Validate each definition with `POST /v1/sequences:validate` before publishing.

### Will my deliverability drop when I switch tools?

Not if reps keep the same Google Workspace mailboxes, because the sending account and domain do not change. The risk is the parallel period, when both tools send from the same mailbox. Split the daily budget between them.

### What happens to prospects in the middle of a sequence?

Let them finish in the old tool and enroll only new contacts in the new one. If you must move them, enroll them in a copy of the sequence that starts at the step they reached. Their next email starts a new thread.

### Does OpenSequence work with Outlook or Microsoft 365?

No. Email goes through the Gmail API only. SMTP and IMAP adapters are on the roadmap but not in the code.

### Do I lose open and click tracking?

Yes. OpenSequence has no open or click tracking. It measures replies and meetings booked, attributed to a sequence, a step and a channel.

### How long does a migration from Apollo or lemlist take?

About four to six weeks for a small team with an engineer. lemlist is faster to convert because its API returns step content. Apollo's step text has to be copied by hand.
