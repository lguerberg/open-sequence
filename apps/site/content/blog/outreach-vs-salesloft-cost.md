---
title: "Outreach vs Salesloft pricing in 2026 for a 15-rep team"
h1: "Outreach vs Salesloft pricing in 2026, and what a self-hosted sequencer costs instead"
description: "Outreach vs Salesloft pricing for 15 reps in 2026. Year one is $36,000 to $40,000 on Outreach, $18,000 to $35,000 on Salesloft and about $16,200 self-hosted."
date: 2026-10-14
updated: 2026-10-20
author: Leo Guerberg
tags: [outreach, salesloft, pricing, self-hosting]
keyword: "Outreach vs Salesloft pricing"
---

A 15-rep team should expect to pay $36,000 to $40,000 in the first year for Outreach and $18,000 to $35,000 for Salesloft, depending on the tier. Neither company publishes prices, so these figures come from Vendr buyer data and Outreach's one public AWS Marketplace offer, plus onboarding and Google Workspace mailboxes. A self-hosted sequencer such as OpenSequence costs about $16,200 in year one and $8,200 in year two, and most of that is engineer time.

We build OpenSequence, so weigh this page with that in mind. We show every number's source and the assumptions behind our own column. We also list what the per-seat price buys that OpenSequence does not do, and the cases where Outreach or Salesloft is the better buy. We checked all prices in October 2026.

## Neither vendor publishes a price

The [Outreach pricing page](https://www.outreach.ai/pricing) lists four Amplify packages and a "Request pricing" button on each. The [Salesloft pricing page](https://www.salesloft.com/pricing) lists products and a "Talk to sales" button, with no tiers and no numbers.

That leaves three kinds of evidence. Vendr publishes aggregated contract data from the purchases it handles. Outreach sells one fixed package on AWS Marketplace with a visible price. Pricing roundups fill the gaps. Several of the ones we read cite each other or show medians computed from zero transactions, so we left them out.

| | Outreach | Salesloft |
|---|---|---|
| Published price | None | None |
| Public reference | $180 per seat a month (AWS) | None |
| Vendr median contract | $45,600 a year | $30,740 a year |
| Vendr sample | 919 purchases | 710 purchases |
| Per seat, per Vendr | Not given | $60 to $200+ by tier |
| Minimum seats | 5 to 10 typical | 10 to 15 typical |
| Contract | 12 months typical | Annual or multi-year |
| Onboarding | $5,000 to $25,000+ | $5,000 to $25,000+ |
| Renewal uplift | 3% to 7% a year | 5% to 8% a year |
| Average negotiated saving | 12% | 18% |

Sources: [Vendr on Outreach](https://www.vendr.com/marketplace/outreach), [Vendr on Salesloft](https://www.vendr.com/marketplace/salesloft) (both updated February 2026) and the [Outreach listing on AWS Marketplace](https://aws.amazon.com/marketplace/pp/prodview-hm7n4y6z3x36i).

### Outreach

The AWS Marketplace listing sells "Orchestrate (50 seats)" for $108,000 over 12 months. That is $2,160 per seat per year, or $180 a month. Orchestrate is an older package name, and 50 seats is more than our example team. Treat $180 as a reference point, not as your quote.

Vendr does not break Outreach down by seat. It reports the median contract and a range from $8,660 to $215,400. Volume discounts begin around 20 to 25 users. Add-ons such as Kaia, conversation intelligence and Commit can raise the contract value by 20% to 40%. Premium support costs 10% to 15% of the annual contract value.

### Salesloft

Vendr gives Salesloft a per-seat table, per user per month:

| Tier | List | What buyers paid | Typical buyer size |
|---|---|---|---|
| Essentials | $75 to $100 | $60 to $85 | 10 to 25 users |
| Advanced | $125 to $150 | $100 to $130 | 25 to 75 users |
| Premier | $165 to $200+ | $130 to $170 | 75+ users |

A 15-rep team is at Vendr's 10 to 15 seat minimum. That puts it in the Essentials buyer band, and it should expect to pay close to list on Advanced. Salesloft prices add-ons as a share of the base. Conversations, for call recording and transcription, adds 20% to 40%. Rhythm, for next-best-action, adds 15% to 30%, and Deals adds 10% to 20%.

## What changed in 2025 and 2026

Clari and Salesloft [announced their merger](https://www.salesloft.com/company/newsroom/clari-and-salesloft-announce-merger-agreement) on August 7, 2025, and [closed it on December 3, 2025](https://salesloft.com/company/newsroom/clari-salesloft-merger) with Steve Cox as CEO. The clari.com domain now redirects to salesloft.com, and the Salesloft pricing page lists Clari Forecast next to Cadence, Conversations, Deals and Rhythm. In practice, forecasting is now a line item on the same Salesloft quote. Ask for each product priced separately before you accept a bundle.

Outreach moved its site to outreach.ai and repackaged around AI credits. Its pricing page says the model "combines two models: seat-based access, where you pay for each user, and consumption-based AI credits, where you pay for what you use." Essentials includes 10,000 credits, Core 25,000, Plus 50,000 and Pro 100,000. Extra credit packs are for sale, and the page does not price them. Budget for credit purchases on top of seats, and ask what one credit buys before you sign.

## Outreach and Salesloft for 15 reps

Outreach at the AWS reference price is 15 × $180 × 12 = $32,400. With Vendr's 12% average negotiated saving it is $28,512. Vendr says volume discounts start at 20 to 25 users, so a 15-seat team is unlikely to get a price below that.

Salesloft Essentials, at what Vendr's 10 to 25 user buyers paid, is 15 × $60 × 12 = $10,800 to 15 × $85 × 12 = $15,300. Salesloft Advanced at list is 15 × $125 × 12 = $22,500 to 15 × $150 × 12 = $27,000.

Both vendors charge for onboarding. We use $5,000, the bottom of Vendr's range for both, because a 15-rep team rarely needs the enterprise package. We leave out add-ons and premium support. Those would raise the vendor totals by 20% or more.

## Self-hosted costs, line by line

OpenSequence is an Apache-2.0 sequencing engine that runs as one Docker image next to a Postgres you own. Our [install guide](https://docs.opensequence.dev/docs/self-hosting/install) covers the production setup. For our example team, the bill has four parts.

### Hosting

The [scaling guide](https://docs.opensequence.dev/docs/self-hosting/scaling) suggests 500 mCPU and 512 MB to start. It also estimates that 30 sequences with about 500 active contacts produce 5,000 to 15,000 step executions a day. For that load, one container with `SEQ_ROLES=all` and a small Postgres are enough. On [Render's list prices](https://render.com/pricing):

| Item | Monthly |
|---|---|
| Pro workspace | $25 |
| Standard web service (1 CPU, 2 GB) | $25 |
| Postgres Basic-1gb | $19 |
| 10 GB database storage at $0.30 | $3 |
| Total | $72 |

That is $864 a year. On [Fly.io](https://docs.fly.io/about/pricing), a shared-cpu-1x machine with 1 GB costs $6.70 a month and Managed Postgres starts at $38. The same setup there is about $45 a month.

### Mailboxes

OpenSequence sends each email through the rep's own mailbox over SMTP. Outreach and Salesloft also send from the rep's mailbox, so this cost is the same in every column. [Google Workspace](https://workspace.google.com/pricing) Business Standard is $14 per user per month on an annual plan, so 15 × $14 × 12 = $2,520.

Each rep creates a Workspace app password once, and the engine checks the login before it saves it. The [email setup guide](https://docs.opensequence.dev/docs/modules/email) lists the settings.

### SMS and calls

OpenSequence sends texts and pushes call tasks to a power dialer through [Allo](https://docs.opensequence.dev/docs/modules/sms/allo). It has no Twilio integration today. On the [Allo pricing page](https://www.withallo.com/pricing), Business is $32 per seat per month billed yearly and includes outbound SMS to US numbers, call recording and AI call summaries. The Power Dialer is $50 a month for the whole team, and 10DLC registration is $24 once.

For 15 reps that is 15 × $32 × 12 = $5,760, plus $600 for the dialer and $24 for 10DLC, so $6,384 in year one. Email-only teams skip this line.

### Engineer time

This is the largest cost, and you should replace our assumptions with yours. We assume a loaded rate of $100 an hour and these hours for year one:

| Task | Hours |
|---|---|
| Deploy, secrets, TLS, backups | 8 |
| Rep mailbox connections | 8 |
| Webhooks into your CRM | 16 |
| Enroll button and task list in your CRM | 40 |
| First sequences written as code | 8 |
| Maintenance, 4 hours a month | 48 |
| Total | 128 |

OpenSequence has no user interface, so the 40-hour line is the easiest to underestimate. Your CRM or an internal tool has to show sequences, enrollments and tasks to reps. Year one comes to 128 × $100 = $12,800. Year two is maintenance only, 48 × $100 = $4,800.

## 12-month totals, side by side

Every row is 15 reps and includes $2,520 for Google Workspace. Vendor rows include $5,000 onboarding in year one and Vendr's renewal uplift in year two, which is 3% to 7% for Outreach and 5% to 8% for Salesloft. Self-hosted rows include hosting and engineer time.

| Option | Year one | Year two |
|---|---|---|
| Outreach | $36,032 to $39,920 | $31,887 to $37,188 |
| Salesloft Essentials | $18,320 to $22,820 | $13,860 to $19,044 |
| Salesloft Advanced | $30,020 to $34,520 | $26,145 to $31,680 |
| OpenSequence, email only | $16,184 | $8,184 |
| OpenSequence with Allo | $22,568 | $14,544 |

We put zero engineer hours on the vendor rows. Someone administers Outreach too, so this choice favors the vendors.

Against Salesloft Essentials, self-hosting saves $2,136 to $6,636 in year one. The savings grow in year two, when engineer time drops to maintenance, and they grow again with headcount. Each rep you add costs $720 to $2,160 a year in vendor seats, $0 in OpenSequence, and $384 in Allo if that rep texts.

## What the per-seat price buys that OpenSequence does not

The vendor price covers a finished application. Every Outreach package includes conversation intelligence. Core adds the Outreach Voice integrated dialer and call insights. Plus adds deal management, win and loss analysis, and meeting integrations with Zoom, Teams, Meet and Webex. Pro adds forecasting. Salesloft sells a [dialer with local presence](https://www.salesloft.com/platform/dialer-messenger), Conversations for recording and coaching, Rhythm for next-best-action, Deals, and Clari Forecast.

OpenSequence does none of the following:

- It has no user interface for reps or managers.
- It does not record, transcribe or score calls. Allo records the calls it dials.
- It has no coaching, forecasting or deal management.
- It has no contact database and no mailbox warm-up.
- It sends email over SMTP and IMAP, so Microsoft 365 teams, whose mailboxes no longer allow password sign-in, cannot use it today.
- Steps outside email, SMS and calls are tasks a rep performs by hand.

OpenSequence does the sequencing. It sends from each rep's own mailbox and threads follow-ups. It applies daily caps per sender, send windows in the contact's time zone, and an 08:00 to 21:00 window for texts. It detects replies, bounces and opt-outs, takes booked meetings your app reports, then exits the enrollment and sends a signed webhook to your app. [Enrollment](https://docs.opensequence.dev/docs/concepts/enrollment) follows one contact through every step. The project is pre-1.0, and the TypeScript SDK installs with `npm install @opensequence/sdk`.

## When Outreach or Salesloft is the better buy

Self-hosting is the wrong choice for many teams. Pay for Outreach or Salesloft if any of these apply:

- You have no engineer who can spend two weeks on setup and a few hours a month after.
- Your reps send from Microsoft 365.
- You want recording, coaching and forecasting on one contract with one vendor to call.
- Managers need dashboards and a sequence editor on day one.
- You have five reps or fewer. At that size the engineering hours cost more than the seats you would save.

Self-hosting is worth it when you already run your own CRM or product, your headcount grows, or you want sequences inside software you sell to customers. Our [migration guide for replacing a sequencing tool](/blog/replace-your-sales-sequencing-software) covers the move. If you are weighing writing the engine yourself, read [what it takes to build your own sales sequencer](/blog/build-your-own-sales-sequencer) first.

## How to bring a vendor quote down

If you stay, Vendr's data points to five tactics. Multi-year terms of 24 to 36 months cut the effective annual price by 15% to 30% for both vendors. Ask for the renewal escalator in writing, since 3% to 8% a year compounds. Vendr suggests a 60 to 90 day notice window for auto-renewal, so put the date in a calendar 90 days ahead. On Outreach, ask how many AI credits your team will use and what the next pack costs. On Salesloft, get Conversations, Rhythm and Clari Forecast priced as separate lines before you accept a bundle.

For the cheaper end of the market, our [Apollo alternatives comparison](/blog/apollo-alternatives) covers tools billed at $49 to $119 a seat.

## FAQ

### How much does Outreach cost per user in 2026?

Outreach does not publish prices. Its only public price is an AWS Marketplace package at $108,000 for 50 seats over 12 months, which is $180 per seat per month. Vendr's median Outreach contract is $45,600 a year across 919 purchases.

### How much does Salesloft cost per user?

Salesloft does not publish prices either. Vendr's data puts Essentials at $75 to $100 per user per month at list, Advanced at $125 to $150, and Premier at $165 to $200 or more. Buyers with 10 to 25 users paid $60 to $85 on Essentials.

### Is Salesloft cheaper than Outreach?

On Vendr's data, yes. The median Salesloft contract is $30,740 a year against $45,600 for Outreach, and Salesloft Essentials costs less than any Outreach reference price we found. For a 15-rep team, Salesloft Advanced at list costs close to Outreach.

### Did Clari and Salesloft merge?

Yes. They announced the merger on August 7, 2025, and closed it on December 3, 2025, with Steve Cox as CEO. Clari's site now redirects to salesloft.com, and Salesloft sells Clari Forecast as one of its products.

### Do Outreach and Salesloft require annual contracts?

Both sell annual or multi-year contracts, according to Vendr. Most Outreach contracts last 12 months, and 24 to 36 months is common for larger teams. Salesloft bills per user per month, paid annually or multi-year.

### What does it cost to self-host a sales sequencer?

For 15 reps on OpenSequence, expect about $864 a year in hosting on Render and $2,520 in Google Workspace seats you likely already pay. Engineer time is the largest cost, which we estimate at $12,800 in year one and $4,800 a year after. SMS and a dialer through Allo add $6,384 in year one.
