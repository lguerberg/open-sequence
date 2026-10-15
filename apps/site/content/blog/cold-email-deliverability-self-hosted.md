---
title: "Cold email deliverability when you self-host sequences"
h1: "Cold email deliverability when sequences send from your own stack"
description: "Cold email deliverability for self-hosted sequences: Gmail, Yahoo and Outlook sender rules, SPF, DKIM and DMARC records, mailbox caps, bounces and opt-outs."
date: 2026-10-14
updated: 2026-10-14
author: Leo Guerberg
tags: [deliverability, cold-email, dns, self-hosting]
keyword: "cold email deliverability"
---

Cold email deliverability on your own stack comes down to five things. You need a sending domain with SPF, DKIM and DMARC that align with the From address, and a user-reported spam rate under 0.1% that never touches 0.3%. You also need low per-mailbox volume that grows slowly, a working one-click unsubscribe, and hard bounces that stop all further mail to that address. US law requires only the opt-out, a postal address and honest headers. The rest are mailbox provider rules or plain practice, and each section below cites which.

We build OpenSequence, an open source sequencing engine you run yourself, so read this with that in mind. The last two tables split each item into what the engine does and what you configure, then list the checks to run before the first send.

## What you take on when you leave the vendor

OpenSequence sends each email through the rep's own Google Workspace mailbox with the Gmail API. Google's servers relay the message, so reverse DNS, TLS and IP reputation are Google's problem, not yours. You own the domain, its DNS records, the list, the volume, the content and the monitoring.

Today the only email provider is Google. Reps on Microsoft 365 cannot send through OpenSequence yet. SMTP and IMAP are on the [roadmap](https://docs.opensequence.dev/docs/community/roadmap) as a later phase, with no date. The engine also has no warm-up, no email verification and no inbox placement testing. If you want those bundled and nobody on the team will own DNS and a weekly look at bounce numbers, a hosted cold email tool is the better choice. Our [lemlist alternative post](/blog/lemlist-alternative-self-hosted) covers that trade.

## Which rules are law and which are provider policy

| Rule | Source | Type | Applies to |
|---|---|---|---|
| Opt-out in every commercial email, honored within 10 business days, postal address, true headers | [FTC CAN-SPAM guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business) | US law | All commercial email, B2B included |
| No consent needed for company addresses, but identify yourself and offer an opt-out | [ICO guide to PECR](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/) | UK law | UK corporate subscribers |
| SPF or DKIM, PTR, TLS, spam rate under 0.3% | [Google sender guidelines](https://support.google.com/a/answer/81126) | Provider policy | All mail to personal Gmail |
| SPF and DKIM, DMARC, alignment, one-click unsubscribe | Google, [Yahoo](https://senders.yahooinc.com/best-practices/) | Provider policy | Bulk senders |
| SPF and DKIM pass, DMARC at least `p=none`, aligned | [Microsoft](https://techcommunity.microsoft.com/blog/outlook/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730) | Provider policy | 5,000+ a day to Outlook.com |
| Start low, increase volume slowly | Google sender guidelines | Best practice | Everyone |

The FTC states that CAN-SPAM "makes no exception for business-to-business email", and its guide puts the penalty at up to $53,088 per violating email. PECR lets you email companies without consent, but sole traders and some partnerships count as individuals and need consent. EU rules differ by country. Get local advice before you email into the EU.

## Gmail, Yahoo and Outlook sender requirements

Google's rules took effect on February 1, 2024. Every sender to personal Gmail needs SPF or DKIM, valid forward and reverse DNS, TLS, RFC 5322 formatting, and a spam rate below 0.3%. Bulk senders, defined as close to 5,000 messages a day to personal Gmail accounts, also need SPF and DKIM together, a DMARC record, From alignment with SPF or DKIM, and one-click unsubscribe on marketing mail. Google's [FAQ](https://support.google.com/a/answer/14229414) adds three details that matter for cold outreach. Messages from the same primary domain, subdomains included, count toward the 5,000. Bulk status is permanent once reached. And starting November 2025, "Gmail is ramping up its enforcement on non-compliant traffic", with temporary and permanent rejections and a faster timeline for new domains.

Yahoo's list matches Google's and asks bulk senders to honor unsubscribes within 2 days. Yahoo gives no volume number for "bulk". Microsoft's rules for Outlook.com, Hotmail and Live addresses started May 5, 2025, for domains sending over 5,000 a day. Microsoft first planned to route failing mail to Junk. An April 29 update to its announcement switched to rejection, with `550; 5.7.515 Access denied, sending domain [SendingDomain] does not meet the required authentication level.`

Most cold email guides skip one detail. Google's FAQ says the guidelines "don't apply to messages sent to Google Workspace accounts". Microsoft's rules cover the consumer service only, not Microsoft 365. Most B2B prospects sit on exactly those business mailboxes. Treat the published rules as the floor anyway. Your lists contain personal Gmail and Outlook addresses, business inboxes still filter spam, and these are the only numbers any provider publishes.

## The 0.3% spam rate and Postmaster Tools

Google asks senders to keep the spam rate in Postmaster Tools below 0.1% and to never reach 0.3%. A bulk sender above 0.3% loses access to Google's mitigation until the rate stays under 0.3% for 7 consecutive days.

Postmaster Tools has two limits for a sales team. Its data "only applies to messages sent to personal Gmail accounts", and "data might be missing if the total number of messages for a given day is too low" ([Postmaster Tools help](https://support.google.com/mail/answer/9981691)). Five reps at 30 emails a day, mostly to Workspace addresses, will often see empty charts. Register the domain anyway. Day to day, watch the numbers you do control: bounces per step, opt-outs, and replies that say "stop emailing me".

## SPF, DKIM and DMARC for a secondary sending domain

Send cold email from a separate registered domain, not your main one and not a subdomain of it. Google counts subdomains toward the primary domain, so `mail.acme.com` counts as `acme.com` for bulk sender status. If `getacme.com` gets blocked, invoices and support replies from `acme.com` still arrive. The cost is one extra Workspace user per sending mailbox, $7 per user per month on Business Starter with an annual plan as of October 2026 ([pricing](https://workspace.google.com/pricing)), plus a domain that recipients do not recognize. Redirect its website to your main site so a curious prospect lands somewhere real.

Add `getacme.com` to Workspace, create the reps' sending mailboxes on it, and publish these records:

```dns
; SPF: only Google may send for getacme.com
getacme.com.                      TXT  "v=spf1 include:_spf.google.com ~all"

; DKIM: generate a 2048-bit key in Admin console > Apps > Google Workspace > Gmail > Authenticate email
google._domainkey.getacme.com.    TXT  "v=DKIM1; k=rsa; p=MIIBIjANBgkqh...IDAQAB"

; DMARC: monitor first, aggregate reports go to the main domain
_dmarc.getacme.com.               TXT  "v=DMARC1; p=none; rua=mailto:dmarc@acme.com; adkim=r; aspf=r"

; on acme.com: lets getacme.com send its DMARC reports there (RFC 7489, section 7.1)
getacme.com._report._dmarc.acme.com.  TXT  "v=DMARC1"
```

The SPF record follows [Google's SPF guide](https://knowledge.workspace.google.com/admin/security/set-up-spf). Publish exactly one SPF record per domain and stay under the 10 DNS lookup limit in [RFC 7208](https://www.rfc-editor.org/rfc/rfc7208#section-4.6.4). The DKIM selector `google` and the 2048-bit key come from [Google's DKIM guide](https://knowledge.workspace.google.com/admin/security/set-up-dkim). After DNS propagates, click "Start authentication" in the Admin console. The external report record is what most setups miss. Without it, receivers skip the aggregate reports bound for `acme.com`.

`p=none` meets the Google, Yahoo and Microsoft minimum. Microsoft recommends `p=reject`. Once a few weeks of reports show only Google as a source, move to `p=quarantine`.

### Alignment

DMARC passes when the From domain matches the domain SPF checked or the `d=` domain of a valid DKIM signature. Relaxed mode (`adkim=r`, `aspf=r`) accepts a match on the organizational domain. Send a test from a rep's mailbox to a personal Gmail account and open "Show original". SPF, DKIM and DMARC should all say PASS, and the DKIM line should name `getacme.com`.

## One-click unsubscribe and 1:1 sales email

Google requires one-click unsubscribe "only for marketing and promotional messages", and adds that "message recipients, not Google, determine the nature of the messages they receive." A cold sales email is promotional to the person receiving it. The requirement formally binds bulk senders, but a missing unsubscribe pushes recipients toward the spam button, and every spam report counts against you.

[RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.html) defines the mechanism. `List-Unsubscribe` must contain an HTTPS URI, `List-Unsubscribe-Post` must read `List-Unsubscribe=One-Click`, and the DKIM signature must cover both headers. The POST carries no cookies, and the server must not answer it with a redirect.

OpenSequence adds both headers to every email it sends, and `{{ unsubscribe_url }}` renders the same signed link in the body. A click or a mail client's POST writes an email suppression and exits the enrollment at once, well inside Google's 48 hours and CAN-SPAM's 10 business days. A body without the link publishes with a `NO_UNSUBSCRIBE` warning, not an error. Some teams drop the visible link to keep a 1:1 tone and rely on the headers plus a "reply 'no' and I'll stop" line. That is defensible under CAN-SPAM, which accepts a reply-based opt-out, but Google's bulk rules ask for a visible link. The details are in [consent and suppressions](https://docs.opensequence.dev/docs/contacts/consent-and-suppressions).

The links point at `SEQ_PUBLIC_URL`, which must be public HTTPS ([install guide](https://docs.opensequence.dev/docs/self-hosting/install)). Links stay valid for 90 days and derive from the first key in `SEQ_ENCRYPTION_KEYS`, so rotating that key breaks the links in every email already sent. CAN-SPAM requires a working opt-out for 30 days after sending.

## Volume per mailbox and ramp-up

Workspace caps a user at 2,000 messages and 2,000 unique external recipients a day, over a rolling 24 hours, and 500 on a trial account ([sending limits](https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace)). Those caps exist to stop abuse. Plan well below them. Google's only ramp guidance is to "start with a low sending volume to engaged users, and slowly increase the volume over time."

OpenSequence defaults each sender's email channel to 30 sends in a rolling 24 hours, with at least 60 seconds between sends. Follow-ups count against the same cap. The ramp below is our practice, not a provider rule:

| Week | `daily_limit` per mailbox | Move on when |
|---|---|---|
| 1 | 10 | Bounces under 2%, no angry replies |
| 2 | 20 | Same, plus some replies |
| 3 | 30 | Same |
| 4+ | 40 to 50 | Replies hold steady |

Change the cap with one call, `PATCH /v1/senders/{id}/channels/email` and `{"daily_limit": 20}` ([senders](https://docs.opensequence.dev/docs/senders/senders)). The enrollment preview staggers first touches by that cap, so at 30 a day contact 31 starts tomorrow ([enrolling](https://docs.opensequence.dev/docs/enrollments/enrolling)). `weekly_limit` is stored but the executors do not enforce it yet.

## Tracking pixels and link tracking

OpenSequence v1 has no open or click tracking. Emails go out as plain text by default, with no pixel and no rewritten links. Click tracking rewrites every link to a redirect on another domain, so filters see a second domain in every message. Opens stopped being a reliable signal in 2021, when Apple's [Mail Privacy Protection](https://www.apple.com/newsroom/2021/06/apple-advances-its-privacy-leadership-with-ios-15-ipados-15-macos-monterey-and-watchos-8/) began helping users "prevent senders from knowing when they open an email."

You lose open-based branching and open alerts. Measure replies and meetings per 100 delivered instead, which the analytics endpoints return per sequence and per step. If you need click data, link to a page on your own domain with UTM parameters and read it in your web analytics.

## Bounces, complaints and list hygiene

The engine polls each sender's Gmail every minute. A message from `mailer-daemon` or `postmaster` with a delivery-status part counts as a bounce, and the engine matches it to the original by `Message-ID`. A 5.x.x status is a hard bounce. It suppresses the address for email and exits the enrollment with `bounced`. A 4.x.x soft bounce suppresses nothing.

Complaints are a gap. The engine handles a `complaint` signal, but the Gmail adapter never produces one, because Gmail gives individual senders no per-message complaint feed. Postmaster Tools is the only complaint view you get.

The engine does not verify addresses. Run your list through a verification service before you enroll. A new domain has no sending history to offset the bounces from a bad list. Report do-not-contact flags from your CRM as `suppressed` events ([contact events](https://docs.opensequence.dev/docs/contacts/events)). The engine only sees its own channels, so a contact marked "do not email" in your CRM keeps getting mail until you report it. Our rule of thumb is to stop email for the project when a batch bounces above 2%, with `PUT /v1/engine/flags/channel:email` and `{"value": false}`, and clean the list before turning it back on.

## What OpenSequence does and what you configure

| Item | OpenSequence | You |
|---|---|---|
| PTR, TLS, IP reputation | Sends via Gmail API on Google's servers | Nothing |
| SPF, DKIM, DMARC | Nothing | DNS records, DKIM in the Admin console |
| One-click unsubscribe | Headers on every email, hosted page, publish warning | Public HTTPS `SEQ_PUBLIC_URL`, stable keys |
| Honoring opt-outs | Suppress and exit at once, checked at every send | Report CRM opt-outs |
| Volume | `daily_limit`, `min_gap_seconds`, staggered first touches | The ramp |
| Send times | `settings.send_window` in the contact's zone | Set the window |
| Hard bounces | Detected in Gmail, suppress and exit | Verify lists first |
| Spam complaints | Not detected | Postmaster Tools |
| Tracking | None | UTM links if needed |
| Postal address | Nothing | Put it in the template |

## Pre-launch checklist

| Check | How to confirm |
|---|---|
| Secondary domain, website redirects to main site | Open it in a browser |
| One SPF record with `include:_spf.google.com` | `dig TXT getacme.com` |
| DKIM 2048-bit, authentication started | `dig TXT google._domainkey.getacme.com` |
| DMARC `p=none` with `rua`, report record on main domain | `dig TXT _dmarc.getacme.com` |
| Test email shows SPF, DKIM, DMARC PASS | "Show original" in Gmail |
| Domain added to Postmaster Tools | Verified in the console |
| `SEQ_PUBLIC_URL` serves the opt-out page over HTTPS | Click a test link, then POST to it |
| Every email body has `{{ unsubscribe_url }}` or a reply opt-out | No `NO_UNSUBSCRIBE` at publish |
| Postal address in the signature | Read a rendered test |
| `daily_limit` at 10 for week one | `GET /v1/senders/{id}` |
| Send window set | Read the sequence settings |
| List verified, CRM do-not-contacts reported | Suppressions on `GET /v1/contacts/{id}` |

For the rest of the move, see the [guide to replacing your sales sequencing software](/blog/replace-your-sales-sequencing-software) and [what building your own sequencer involves](/blog/build-your-own-sales-sequencer).

## FAQ

### Do Gmail's bulk sender rules apply to cold email sent to business addresses?

Not formally. Google says its sender guidelines do not apply to messages sent to Google Workspace accounts, and Microsoft's rules cover Outlook.com consumer addresses only. Most lists still include personal addresses, and business inboxes still filter spam, so meet the bulk rules anyway.

### Is one-click unsubscribe required for cold sales emails?

Google requires it from bulk senders for marketing and promotional mail, and says the recipient decides what counts as promotional. CAN-SPAM requires some opt-out in every commercial email, which can be a reply-based one. The List-Unsubscribe headers cost nothing, so send them on every message.

### How many cold emails can one mailbox send per day?

Workspace allows up to 2,000 messages a day per user, but that is an abuse limit. A new mailbox should start near 10 a day and grow to 30 to 50 over a month, counting follow-ups. Add mailboxes rather than raising the cap past that.

### Should I send cold email from my main domain?

No. Use a separate registered domain, because Google counts a subdomain toward your main domain's bulk sender status. If the cold domain gets blocked, your main domain's invoices and support mail keep arriving.

### Does DMARC p=none satisfy the sender requirements?

Yes. Google, Yahoo and Microsoft all accept `p=none` as the minimum, as long as SPF or DKIM aligns with the From domain. Microsoft recommends `p=reject`, so move to `p=quarantine` once your reports show only Google sending for the domain.
