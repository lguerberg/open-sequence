# OpenSequence changelog

What changed in each release, one section per version.

The API is additive: fields and endpoints are added, nothing is removed or repurposed without a new version path, and a definition's `schema_version` is read forever. A deprecation is marked on the affected page with a callout and a date. OpenSequence is pre-1.0, so a minor version may still change the API; this file says when it does.

## 0.3.1

- An agent call now goes out from the enrolling sender's Allo number, the one on their SMS channel, so each contact is called from their own rep's line. `allo_number` on the step is optional and fixes one line for every contact. A sender with no Allo number skips the step with `no_allo_number`. Each sender's number must be one of the agent's lines.
- The mock agent's line is the mock Allo number `+15550000001`.
- No migration. SDK unchanged (0.3.0).

## 0.3.0

- AI agent calls through Allo. The new `call` channel has one action, `agent_call`: an Allo Outbound agent phones the contact's `phone` with the step's `title` (the objective) and `description` (the brief), both templates. The step names the agent and the line it calls from (`agent_id`, `allo_number`) and may turn on skills: `sms`, `book`, `transfer`. Allo places the call inside the agent's calling hours and tries up to 3 times. The step waits for the result (up to `give_up_after`, default `3d`) and follows the outcome: `reached`, `transferred`, `not_interested`, `wrong_number`, `do_not_call` or `not_reached`; an outcome with no transition follows `completed`. `reached` and `transferred` count as a connected call; `do_not_call` suppresses calls to the contact (the new suppression channel `call`). See [Allo agent calls](https://docs.opensequence.dev/docs/modules/calls/allo).
- `GET /v1/project/providers/allo/agents` (SDK `project.alloAgents()`): the Allo Outbound agents and the lines each one calls from, for pickers.
- The Allo key needs three more permissions for agent calls: `OUTBOUND_CALLS_WRITE`, `AGENTS_READ` and `TASKS_READ`. Texts and call tasks need nothing new, and saving a key without them still works.
- SMS consent is now outreach consent, because it gates agent calls too. `PUT /v1/contacts/{id}/outreach-consent`, SDK `contacts.setOutreachConsent()`, the contact fields `outreachConsent`, `outreachConsentAt` and `outreachConsentSource`, and the condition field `contact.outreach_consent`. Deprecated and still working: `PUT /v1/contacts/{id}/sms-consent`, `contacts.setSmsConsent()`, the `smsConsent*` fields (returned next to the new ones) and `contact.sms_consent`.
- The validator now takes an outreach step's transitions from its channel action. Email and SMS steps are unchanged (`sent`, `skipped`, `failed`); a call step refuses `sent`.
- A new scheduler job, `calls`, reads agent call results once a minute. With mock providers, `POST /hooks/mock/{project slug}/agent-calls` ends a mock call.
- SDK 0.3.0. Migration `0006_outreach_consent` renames `seq.contacts.sms_consent`, `sms_consent_at` and `sms_consent_source` to `outreach_consent*` and runs at boot. A rename is not additive: a replica still on 0.2 fails on contacts once the migration has run, so stop the old replicas, migrate, then start the new image.

## 0.2.0

- LinkedIn connection requests, as a step the sender completes in one click. LinkedIn forbids automating invitations, so nothing is sent for the sender: the new `linkedin_connect` node renders the note (a template; cut at 300 characters, with a warning above 200, LinkedIn's limit without Premium) and creates a task of kind `linkedin_connect` with the contact's profile as `link` and the note as `body`. Transitions: `completed`, `no_answer` (expired or cancelled) and `skipped` (the contact has no LinkedIn URL). See [LinkedIn](https://docs.opensequence.dev/docs/modules/linkedin).
- `POST /v1/tasks/{id}/open` (SDK `tasks.open(id)`): the sender opened the task. It records `openedAt` the first time; a task whose step says opening means doing it (`completeOnOpen`, `sent` on every LinkedIn task) completes there and the sequence moves on. Tasks carry the new fields `openedAt` and `completeOnOpen`, and `kind` is documented as the task's type (`call`, `linkedin_connect`, or what a `task` step names).
- Contacts have a `linkedin_url` again. `linkedin.com/in/dana` and `https://www.linkedin.com/in/dana/` are stored as `https://www.linkedin.com/in/dana`; an address off linkedin.com is a `422 INVALID_CONTACT`. Templates read `{{ contact.linkedin_url }}` and conditions `contact.has_linkedin`.
- The `task.created` webhook payload carries `opened_at`.
- SDK 0.2.0. Migration `0005_linkedin_tasks` adds `seq.contacts.linkedin_url`, `seq.tasks.complete_on_open` and `seq.tasks.opened_at` (all nullable) and runs at boot.

## 0.1.3

- Fix: the project setting `store_inbound_bodies` did nothing for mailboxes connected over SMTP and IMAP. The poller never asked the mailbox for reply text, so every inbound message was stored without a body even with the setting on. The poll now carries the project's setting (`includeBodies` on the email provider's `poll` request), and a reply's body is read and stored when it is on. The `SmtpProviderOptions.includeBodies` constructor option still forces it on or off for every poll when set.
- A stored reply body is the plain text of what the contact wrote: the quoted history is cut at the attribution line (`On … wrote:`, wrapped or in Spanish, Portuguese, French, German, Italian, Dutch or Swedish), at an Outlook header block (`From:` / `Sent:` / `To:` / `Subject:`, after a rule or `-----Original Message-----`), and `>` quoted lines are dropped. An HTML-only reply is cut before its `gmail_quote` or `blockquote`. Bodies are capped at 20,000 characters.
- Turning the setting on applies to replies that arrive afterwards; earlier replies stay without a body.
- The SDK is unchanged (0.1.2). No migration.

## 0.1.2

- Branded HTML emails: an `html` body may hold up to 5,000,000 characters (text bodies stay at 100,000), and the definition limit is now 10 MB (was 256 KB). Base64 images (`<img src="data:image/png;base64,...">`, PNG, JPEG, GIF or WebP) are sent as inline attachments in a `multipart/related` with `cid:` references, so Gmail, Outlook and Apple Mail show them; identical images are attached once; hosted `https` images are untouched. An image over 1 MB fails the step with `IMAGE_TOO_LARGE`, a message over 10 MB with `MESSAGE_TOO_LARGE`. The validator warns `HEAVY_EMAIL` above 400 KB of embedded images. The text alternative shows images as `[alt]`. See [HTML emails and images](https://docs.opensequence.dev/docs/concepts/sequence/templates#html-emails-and-images).
- Rich signatures: `signature_html` up to 1 MB, sanitized with an email allowlist that keeps table layouts, inline styles (an allowlist of CSS properties) and `https` or base64 images. Images over plain `http` are now dropped. The text twin shows images as `[alt]`.
- The unsubscribe link on your domain: the project setting `unsubscribe_url` (an `https` URL with `{token}`) is used by `{{ unsubscribe_url }}` and the `List-Unsubscribe` headers. `GET /v1/unsubscribes/{token}` reads a token, `POST /v1/unsubscribes/{token}` applies it (scope `enroll`); SDK `unsubscribes.get(token)` and `unsubscribes.apply(token)`. See [Host the unsubscribe page in your app](https://docs.opensequence.dev/docs/modules/email#host-the-unsubscribe-page-in-your-app).
- Fix: the hosted unsubscribe page at `/u/{token}` answered `414` for every real token, because the router capped path parameters at 100 characters. The cap is now 2,048.
- No migration.

## 0.1.1

- Fix: an outreach step with `settings.jitter` rolled a new jitter every time its own deferral fired, so with `jitter: "20m"` each wake-up had about a 5% chance to send, and sends slid by hours or into the next day. Jitter is now rolled once when the step picks its send time; the wake-up that time produces sends if it is inside the send window. A step woken outside the window (for example, resumed after a pause) is moved into the next window with one new roll. Migration `0004_step_deferral` adds the nullable `seq.enrollments.deferral` column and runs at boot.

## 0.1.0 (unreleased)

The first version. The server image is published on every push to `main` as `ghcr.io/lguerberg/open-sequence:main` and `:sha-<commit>`; version tags come with the first release. `@opensequence/sdk` 0.1.0 is on npm (`npm install @opensequence/sdk`); the MCP server ships from the repository and the image.

**Engine**

- The sequence definition: `start`, `outreach`, `wait`, `wait_for`, `condition`, `task` and `end` nodes; durations in `m`, `h`, `d` and `bd`; send windows and jitter; `exit_on` for replies and meetings; validation with a path, a stable code and a sentence per problem.
- Versions: drafts with an optimistic lock, immutable published versions, archiving.
- Enrollment with the one-active-sequence rule, the re-enrollment setting, capacity staggering, preview and dry run.
- The planner, `advance` with run ownership, the email and SMS executors with idempotent sends, the signal pipeline with attribution, the reaper, the retention job, per-project and platform kill switches.
- Conditions on `contact.*`, `attrs.*`, `sender.*`, `history.*` and live `crm.*` facts, every read recorded on the run.
- Templates with fallbacks, and sender signatures: `signature_html` and `signature_text` on `PUT /v1/senders/{id}`, sanitized on save and rendered by `{{ sender.signature }}`.

**Channels and providers**

- Email through the sender's own mailbox over SMTP and IMAP, Gmail and Google Workspace included with an app password (`PUT /v1/senders/{id}/channels/email`, `senders.setSmtp`): both logins checked on save, passwords encrypted and write-only, a copy filed in Sent, replies, bounces and auto-replies read from the IMAP inbox every minute. `DELETE /v1/senders/{id}/channels/email` removes the channel and its passwords. A follow-up sent with `reply_in_thread` carries the full `References` chain of the thread. Microsoft 365 is not supported.
- SMS and call completion through Allo (consent, country, time zone and quiet-hours gates on every text, with no limit on texts per sequence; STOP words; `call.completed` completing call tasks).
- Attio as the read-only CRM behind `crm.*` conditions.
- A mock provider for development and CI, with `POST /hooks/mock/{slug}` to simulate inbound events.

**Interfaces**

- The REST API under `/v1` with an OpenAPI document, Swagger UI at `/docs`, a response envelope and stable error codes.
- Outbound webhooks signed with Standard Webhooks, retried for three days, ordered per enrollment, with recover and replay.
- Analytics: replies and meetings per sequence, step and channel, and the cross-sequence table.
- `@opensequence/sdk` (TypeScript), `@opensequence/auth`, `@opensequence/mcp` (19 tools over HTTP or stdio) and the `oseq` operator CLI.

**Operations**

- One image, roles by `SEQ_ROLES`, migrations at boot under a row lock, Postgres, Redis or in-memory queues, encrypted write-only secrets, health endpoints, this site.
