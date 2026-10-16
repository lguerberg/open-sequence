---
title: "How to replace your sales engagement platform"
h1: "How to move off Outreach, Salesloft, Apollo or lemlist without double-sending anyone"
description: "Replace a sales engagement platform in about six weeks. See what Outreach, Salesloft, Apollo and lemlist export, how to map steps, and how to cut over."
date: 2026-10-14
updated: 2026-10-14
author: Leo Guerberg
tags: [migration, sales-engagement, outreach, apollo]
keyword: "replace sales engagement platform"
---

To replace a sales engagement platform, export your contacts and suppression lists and rebuild each live sequence in the new system. Then start new contacts there while existing ones finish in the old tool, and cancel only after the longest sequence has drained. For a team of about 10 reps, plan on four to six weeks. The sequences are the easy part. The risk is in the jobs the old tool did by default, such as honoring unsubscribes, stopping on replies, and logging activity to the CRM.

We build OpenSequence, an Apache-2.0 open source sequencing engine you run yourself, so this guide uses it as the destination. Most steps apply to any target. For many teams, the better choice is to stay.

## Who should not move

OpenSequence is a headless engine that runs as one container with a Postgres database and an API. It is pre-1.0, and the SDK is not on npm yet. Stay where you are if any of these is true:

- Your reps send from Microsoft 365 or Outlook. OpenSequence sends through the Gmail API only. SMTP and IMAP are on the [roadmap](https://docs.opensequence.dev/docs/community/roadmap), not in the code.
- Nobody on the team writes code. OpenSequence has no UI. Someone has to build the enroll button, the task inbox and the reporting screen on the API.
- Your managers coach on open rates, click rates or A/B tests of copy. The engine tracks none of these. It counts only replies and meetings booked.
- You use Apollo mostly for its contact database, or lemlist mostly for lemwarm. OpenSequence is neither a prospect database nor a warm-up service.
- You need Salesforce or HubSpot sync on day one. The only CRM adapter is for Attio, and it reads from Attio but does not write to it. HubSpot is on the roadmap.

The teams who should move run Google Workspace, have an engineer, and want sequences inside their own CRM or product. If cost is the reason, read [what Outreach and Salesloft cost](/blog/outreach-vs-salesloft-cost) or [the Apollo alternatives compared](/blog/apollo-alternatives) first.

## Inventory the features you use

List the features your team used in the last 90 days. A sequence with no enrollments in a quarter does not need porting.

| In the old tool | In OpenSequence | Gap |
|---|---|---|
| Sequence, cadence, campaign | A versioned JSON definition | None |
| Automatic email step | `outreach` email node | None |
| Threaded follow-up | `reply_in_thread: true` | Threads within one enrollment only |
| Template library | Text inside the node | No shared library |
| Snippets | Constants in your code | No snippet object |
| Call step | `task` with `kind: "call"` | Dialer push works with Allo only |
| Manual step | `task` with your own `kind` | The rep does it by hand |
| Task queue | Tasks API | You build the inbox |
| Connected mailboxes | Senders with Google | Gmail only |
| Open and click tracking | None | Not in v1 |
| A/B test | None | A `split` node is planned |
| CRM activity sync | Webhooks to your code | You write the sync |

Any gap your team depends on is either work for your engineer or a reason to stay.

## What each tool lets you export

Every vendor makes contacts easy to export and sequence content harder.

| Tool | Contacts | Sequence content |
|---|---|---|
| Outreach | CSV, 100K per filtered list | API only |
| Salesloft | API | Cadence export by API |
| Apollo | CSV, credits for net-new | Copy by hand |
| lemlist | CSV or JSON by API | Steps by API |

**Outreach.** The [export overview](https://support.outreach.io/hc/en-us/articles/360038242394) lists prospects, accounts, opportunities, calls, tasks, sequence states, users and emails as exportable. Instant downloads stop at 200 records, Outreach emails anything larger, and a filtered list caps at 100K. The same page says "Templates and Snippets cannot be exported." The REST API does expose `sequences`, `sequenceSteps`, `sequenceTemplates`, `templates` and `snippets` ([common patterns](https://developers.outreach.io/api/common-patterns)), so a script can pull the content the UI cannot export. Export `sequenceStates` too. It tells you who is mid-sequence on cutover day.

**Salesloft.** Export people through [`GET /v2/people`](https://developers.salesloft.com/docs/api/people-index/). `POST /v2/cadence_export_downloads` ([docs](https://developer.salesloft.com/docs/api/cadence-export-downloads-create/)) requests an export of the cadences the user can see. The export runs in the background, and Salesloft emails the file instead of returning it in the response. The [cadence import docs](https://developer.salesloft.com/docs/platform/cadence-imports/introduction/) show the JSON shape, with steps nested under `cadence_content.step_groups[].steps[]`.

**Apollo.** Exporting saved contacts to CSV costs no credits. Exporting net-new contacts does ([Apollo help center](https://knowledge.apollo.io/hc/en-us/articles/4409237712141-Export-Contacts-to-a-CSV)). For sequences, the [search endpoint](https://docs.apollo.io/reference/search-for-sequences) needs a master API key and a paid plan. It returns a step count, not the steps. Plan to copy step text by hand.

**lemlist.** The API exports a campaign's leads as CSV or JSON, filtered by state ([export leads](https://developer.lemlist.com/api-reference/endpoints/campaigns/export-campaign-leads-v2)). The states include `emailsUnsubscribed` and `emailsBounced`, which together give you your suppression list. `GET /campaigns/{campaignId}/sequences` ([docs](https://developer.lemlist.com/api-reference/endpoints/sequences/get-campaign-sequences)) returns every step with its `type`, `delay` in days, `subject` and HTML `message`. lemlist is the easiest of the four to convert with a script.

## Map sequences to definitions

The mapping is mechanical. Each email becomes an `outreach` node, each delay a `wait`, each call or manual step a `task`, and "stop on reply" becomes `exit_on`. The sending schedule becomes `settings.send_window`. Merge fields become template paths such as `{{ contact.first_name | "there" }}`, and custom fields move into the contact's `attrs`.

Watch for three rules on your first publish. `contact.first_name`, `contact.last_name` and `contact.email` must carry a fallback or publishing fails with `BAD_TEMPLATE`. An email body without `{{ unsubscribe_url }}` publishes with the warning `NO_UNSUBSCRIBE`. Templates support only paths and fallbacks, with no conditionals or loops. Put any branching in a `condition` node.

Here is a typical five-touch Outreach sequence after translation. The snippet became a constant.

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
      next: { completed: 'has_phone', no_answer: 'has_phone' },
    },
    has_phone: {
      type: 'condition',
      params: { mode: 'all', rules: [{ field: 'contact.has_phone', op: 'is_true' }] },
      next: { yes: 'call_2', no: 'wait_2' },
    },
    call_2: {
      type: 'task',
      params: { kind: 'call', title: 'Second call to {{ contact.first_name | "them" }}', due: '1bd', dialer: true },
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

A connected call counts as a reply, so `exit_on: ['reply']` ends the flow when a rep reaches the contact. `2bd` means two business days in the contact's time zone, and it does not account for holidays. The full grammar is in [the definition reference](https://docs.opensequence.dev/docs/sequences/definition). Commit the file. From here on, every sequence change is a pull request. Published versions are immutable, so enrolled contacts finish on the version they started.

## Mailboxes and warm-up continuity

If your reps connected Google Workspace mailboxes to Outreach or Salesloft, you do not need to re-warm anything. OpenSequence sends through the [same Gmail accounts by OAuth](https://docs.opensequence.dev/docs/senders/connect-google), from the same domain, with the same reputation. You do need your own Google OAuth client. Google classes Gmail scopes as sensitive. If accounts outside your Workspace domain use the app, Google must verify it before the consent screen stops warning users.

The trap is combined volume during the parallel run. OpenSequence's `daily_limit` defaults to 30 emails with a 60 second minimum gap, and it counts only OpenSequence's own sends. It cannot see what Outreach sent from the same mailbox an hour earlier. If a rep sent 50 a day before, split that budget. Put 35 in the old tool and 15 in OpenSequence in week one, then shift the split as the old sequences drain. Google's hard ceiling is [2,000 messages a day per Workspace user](https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace), and a cold outbound mailbox should stay far below it.

Secondary domains that lemwarm or another warm-up service warms are a different case. OpenSequence does not warm anything, so keep the warm-up service on those mailboxes or retire them. Confirm they are Google Workspace mailboxes before you plan around them.

Google's [sender guidelines](https://support.google.com/a/answer/81126) require SPF, DKIM, DMARC and one-click unsubscribe for senders above 5,000 messages a day to Gmail. They also require a spam rate below 0.30%, with 0.10% as the target. OpenSequence adds `List-Unsubscribe` and `List-Unsubscribe-Post` headers to every email. The rest is DNS work, which [cold email deliverability when you self-host](/blog/cold-email-deliverability-self-hosted) covers.

## Run both systems without double-sending

On any given day, a contact should be in exactly one system. OpenSequence returns `409 ALREADY_IN_SEQUENCE` when you enroll a contact who is already in one of its sequences, but it cannot see Outreach. Your enroll code has to check the old tool too.

Drain the old tool instead of moving people. On cutover day, send new enrollments only to OpenSequence, and let contacts already in an old sequence finish in the old tool. Remove the old tool's "add to sequence" permission so nobody enrolls by habit.

Load suppressions before the first send. The API cannot remove a suppression, so get the list right.

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

Watch for replies on old threads. OpenSequence detects replies only in threads it started, so it does not see a prospect who answers an Outreach email from three weeks ago. While both systems run, forward any such reply as a `reply` event, or that contact keeps getting follow-ups.

Sometimes contacts must move mid-sequence, because the contract ends before the drain does. In that case, export their sequence state, remove them from the sequence in the old tool, and enroll them in a second published sequence whose `entry` is the step they had reached. Its first email cannot thread onto the old one, because `reply_in_thread` only threads within the same enrollment. Write that email as a new message that makes sense without the earlier thread.

Rehearse with `mode: "dry_run"` first. In dry-run mode, the engine records email and text steps with their rendered text instead of sending them. Waits, conditions and tasks run for real ([enrolling](https://docs.opensequence.dev/docs/enrollments/enrolling)).

## CRM sync

Outreach and Salesloft write activities into your CRM. OpenSequence writes nothing to it. You subscribe to [signed webhooks](https://docs.opensequence.dev/docs/webhooks/overview) and write what you want: `run.done` for a sent step, `signal.received` for replies, meetings and bounces, `enrollment.exited` with the reason, and `task.created` for your task inbox. OpenSequence retries each delivery for three days, and the same event can arrive twice. Make the handler idempotent on the event `id`.

The other direction matters more. Your CRM has to push do-not-contact flags, meetings booked in other tools, and deleted contacts back to OpenSequence. The engine never reads your database. If you skip this, it keeps emailing people your reps already excluded. Our tutorial on [adding sales sequences to your own CRM](/blog/add-sales-sequences-to-your-crm) has the code for both directions.

## Reporting parity

Open and click rates do not carry over. OpenSequence counts [replies and meetings](https://docs.opensequence.dev/docs/analytics/outcomes). It credits each one once per enrollment to the touch that earned it, within a 14 day window. It reports them per 100 enrolled and per 100 delivered, by sequence, step and channel.

Each vendor defines "reply rate" its own way, so do not compare dashboards. Before cancelling, export the old sequence stats and recompute replies per 100 enrolled for your top five sequences. Compare OpenSequence's numbers against that baseline after a month of sends.

## Cutover checklist

1. Confirm every sending mailbox is Google Workspace.
2. Export contacts, sequence states, step content and stats from the old tool.
3. Export unsubscribes, bounces and complaints, and load them as suppressions.
4. Deploy OpenSequence, register the Google OAuth client, and connect each sender.
5. Translate the live sequences, validate them, and run one dry-run enrollment each.
6. Build the webhook handler that writes activity to the CRM.
7. Build the task inbox for call and manual steps.
8. Add the old-tool check to your enroll code.
9. Split each mailbox's daily volume between the two systems.
10. Pilot with two reps on new contacts only.
11. Switch all new enrollments, and remove enroll rights in the old tool.
12. Forward replies on old threads as `reply` events until the drain ends.
13. Record baseline reply and meeting rates.
14. Cancel after the last old sequence finishes, and keep the exports.

## A realistic timeline

This is our estimate for a team of about 10 reps with one engineer working half time and sequences no longer than three weeks. It is not a measured benchmark.

| Week | Work |
|---|---|
| 1 | Inventory, exports, deploy, OAuth client, two pilot senders |
| 2 | Translate sequences, dry runs, suppressions, CRM webhook handler, task inbox |
| 3 | Pilot with two reps enrolling new contacts in OpenSequence |
| 4 | All new enrollments move to OpenSequence, and the old tool drains |
| 5 and 6 | Drain ends, baseline check, cancel |

The UI work in week 2 grows with every screen your reps expect. The drain lasts as long as your longest active sequence. Check your contract's notice period in week 1, because a missed auto-renewal date can lock you in for another term. If you are considering building your own engine instead, [what it takes to build your own sales sequencer](/blog/build-your-own-sales-sequencer) covers that option.

## FAQ

### Can I import Outreach sequences into OpenSequence automatically?

There is no built-in importer. Outreach's API exposes sequences, steps and templates. The mapping is mechanical, so a short script can turn them into definitions. Validate each definition with `POST /v1/sequences:validate` before publishing.

### Will my deliverability drop when I switch tools?

Not if reps keep the same Google Workspace mailboxes, because the sending account and domain do not change. The risk is the parallel period, when both tools send from the same mailbox. Split the daily budget between them.

### What happens to prospects in the middle of a sequence?

Let them finish in the old tool and enroll only new contacts in the new one. If you must move them, enroll them in a copy of the sequence that starts at the step they reached. Their next email starts a new thread.

### Does OpenSequence work with Outlook or Microsoft 365?

No. Email goes through the Gmail API only. SMTP and IMAP adapters are on the roadmap but not in the code.

### Do I lose open and click tracking?

Yes. OpenSequence has no open or click tracking. It measures replies and meetings booked, and attributes each one to a sequence, a step and a channel.

### How long does a migration from Apollo or lemlist take?

About four to six weeks for a small team with an engineer. lemlist is faster to convert because its API returns step content. You have to copy Apollo's step text by hand.
