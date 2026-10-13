# @opensequence/sdk

A typed, fetch-based TypeScript client for the [OpenSequence](https://opensequence.dev) API, plus
[Standard Webhooks](https://www.standardwebhooks.com) verification for the events it sends you.
Zero runtime dependencies: it needs `fetch` (Node 20+, Deno, Bun, browsers) and, for webhook
verification, `node:crypto`.

## Install

```bash
pnpm add @opensequence/sdk
# or: npm install @opensequence/sdk
```

## Quickstart: the six calls

The same flow as `docs/ARCHITECTURE.md` section 1.2, through the SDK. You need a running service
(`docker compose up` with mock providers is enough) and the operator token it was started with.

```ts
import { OpenSequence, OpenSequenceAdmin } from '@opensequence/sdk';

// 0. Bootstrap: create a project and its first key with the operator token (shown once).
const admin = new OpenSequenceAdmin({ baseUrl: process.env.SEQ_URL!, adminToken: process.env.SEQ_ADMIN_TOKEN! });
const { project, api_key } = await admin.projects.create({ slug: 'acme', name: 'Acme CRM' });

const oseq = new OpenSequence({ baseUrl: process.env.SEQ_URL!, apiKey: api_key });

// 0b. In production, register your own Google OAuth client once (skip with mock providers).
await oseq.project.setProvider('google', { client_id: '…apps.googleusercontent.com', client_secret: '…' });

// 1. A sender, and connect their Google account (Gmail + Calendar under one consent).
await oseq.senders.upsert('u_42', { name: 'Max Rivera', email: 'max@acme.com', timezone: 'America/New_York' });
const consent = await oseq.senders.connectGoogle('u_42');
// -> { auth_url, connection_id }: the sender opens auth_url once. With mock providers: { status: 'active', mock: true, channel }.

// 2. A contact.
await oseq.contacts.upsert('p_7', {
  first_name: 'Dana',
  email: 'dana@example.com',
  timezone: 'Europe/London',
  attrs: { company: { country: 'UK' } },
});

// 3. A sequence (creates draft v1), save the definition, publish.
const { sequence, version } = await oseq.sequences.create({ name: 'UK intro' });
await oseq.sequences.versions.saveDraft(sequence.id, version.id, { definition, lock_version: version.lockVersion });
await oseq.sequences.versions.publish(sequence.id, version.id);

// 4. Enroll.
const result = await oseq.sequences.enroll(sequence.id, { contacts: ['p_7'], sender: 'u_42' });

// 5. Read: the journey and the sequence's numbers.
const journey = await oseq.enrollments.get(result.enrollments[0]!.id);
const summary = await oseq.analytics.summary(sequence.id);
```

Senders, contacts and sequences can be addressed by their service id (`snd_…`, `ctc_…`, `seq_…`)
or by the `external_id` you gave them, wherever an id is expected.

### Options

```ts
new OpenSequence({
  baseUrl: 'https://sequences.example.com', // no trailing /v1
  apiKey: 'sk_live_…',
  fetch,            // optional: your own fetch (tests, proxies, instrumentation)
  timeoutMs: 30_000, // optional: abort after this long (0 disables)
  userAgent: 'acme-crm/2.0', // optional
});
```

Every method returns the `data` of the API envelope, already unwrapped. The raw HTTP core is
available as `oseq.http.request({ method, path, query, body })` for an endpoint the SDK has no
method for.

## Resources

| Property | Methods |
|---|---|
| `oseq.senders` | `upsert`, `get`, `list`, `listAll`, `readiness`, `connectGoogle`, `connections`, `disconnectGoogle`, `setSms`, `setLinkedin`, `patchChannel`, `deleteChannel`, `disable`, `tasks` |
| `oseq.contacts` | `upsert`, `batch`, `list`, `listAll`, `get`, `timeline`, `patch`, `statuses`, `reportEvent`, `reportEvents`, `setSmsConsent`, `delete` |
| `oseq.sequences` | `list`, `listAll`, `create`, `get`, `update`, `validate`, `enroll`, `previewEnrollment`; `versions.list`, `.create`, `.get`, `.saveDraft`, `.publish`, `.archive`, `.delete` |
| `oseq.enrollments` | `list`, `listAll`, `get` (the journey), `pause`, `resume`, `exit`, `exitMany` |
| `oseq.tasks` | `list`, `listAll`, `get`, `complete`, `cancel` |
| `oseq.webhooks` | `list`, `create`, `get`, `update`, `delete`, `rotateSecret`, `enable`, `recover`, `deliveries`, `replay` |
| `oseq.analytics` | `summary`, `exits`, `nodes`, `channels`, `sequences` |
| `oseq.project` | `get`, `updateSettings`, `setProvider`, `alloNumbers`, `alloUsers`, `attioSchema`, `health`; `apiKeys.list`, `.create`, `.revoke`; `flags.set` |
| `oseq.schema` | `definition`, `fields`, `events` |
| `new OpenSequenceAdmin({ baseUrl, adminToken })` | `projects.create`, `projects.list`, `projects.createApiKey`, `engineHealth` |

Request bodies are snake_case, as the API takes them (`first_name`, `lock_version`). Entities come
back as the API returns them, in camelCase (`firstName`, `lockVersion`, `currentNodeId`, `exitReason`),
with dates as ISO strings; results the server builds by hand (analytics, webhooks, enroll results)
are snake_case. The types in `@opensequence/sdk` follow the wire format exactly.

## Webhooks

Register an endpoint once; the secret is returned once.

```ts
const { endpoint, secret } = await oseq.webhooks.create({
  url: 'https://acme.com/hooks/opensequence',
  event_types: ['enrollment.exited', 'task.created', 'signal.received'], // or ['*']
});
```

Verify every delivery with the **raw** request body (a parsed and re-serialized body will not
verify). The check is the Standard Webhooks one: HMAC-SHA256 over `id.timestamp.body`, a
5-minute timestamp tolerance, constant-time comparison.

```ts
import { verifyWebhook, WebhookVerificationError } from '@opensequence/sdk';

// Express with `express.raw({ type: 'application/json' })`, Fastify with a raw-body plugin, Next.js with `await req.text()`.
app.post('/hooks/opensequence', (req, res) => {
  let event;
  try {
    event = verifyWebhook({ secret: process.env.OSEQ_WEBHOOK_SECRET!, headers: req.headers, body: req.body });
  } catch (err) {
    if (err instanceof WebhookVerificationError) return res.status(400).send(err.code);
    throw err;
  }
  // event: { id, type, project, occurred_at, data }
  if (event.type === 'enrollment.exited') moveDeal(event.data);
  res.status(204).end(); // respond 2xx quickly; do the work after
});
```

`headers` can be a plain object (Node, Express) or a Fetch `Headers`; `body` a string or bytes.
While rotating a secret (`oseq.webhooks.rotateSecret(id)`), pass both: `secret: [oldSecret, newSecret]`.
Deliveries are retried for about three days, ordered per enrollment, and replayable
(`oseq.webhooks.recover(id, { since })`, `oseq.webhooks.replay(deliveryId)`).

## Errors

Everything the API refuses, and anything that never reached it, throws one `OpenSequenceError`:

```ts
import { OpenSequenceError } from '@opensequence/sdk';

try {
  await oseq.sequences.enroll(sequence.id, { contacts, sender: 'u_42' });
} catch (err) {
  if (err instanceof OpenSequenceError && err.is('ALREADY_IN_SEQUENCE')) {
    // err.status === 409; nobody was enrolled
    const { conflicts } = err.details as AlreadyInSequenceDetails;
    …
  } else throw err;
}
```

| Field | Meaning |
|---|---|
| `status` | HTTP status; `0` when no response arrived |
| `code` | the API's stable code (`ALREADY_IN_SEQUENCE`, `STALE_LOCK`, `VERSION_NOT_EDITABLE`, `HAS_ACTIVE_ENROLLMENTS`, `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, …), or a client one: `NETWORK_ERROR`, `TIMEOUT`, `INVALID_RESPONSE` (not JSON or not the envelope), `HTTP_<status>` (non-2xx without an error envelope) |
| `message` | plain English, as the API wrote it |
| `details` | the error's details when there are any (conflicts, validation problems) |
| `requestId` | the API's request id, to search the service logs |

## Pagination

Every list endpoint is cursor-paginated and accepts `limit`, `cursor` and `updated_since`
(a Date or an ISO string). `list()` returns one page; `listAll()` walks every page.

```ts
const page = await oseq.enrollments.list({ sequence: sequence.id, status: 'active', limit: 100 });
page.items;      // this page
page.nextCursor; // pass as `cursor` for the next one; null on the last page

for await (const e of oseq.enrollments.listAll({ updated_since: lastSyncAt })) {
  sync(e);
}
```

## Types

Request bodies and query strings are derived from the service's OpenAPI file
(`src/generated/openapi.ts`, regenerated with `pnpm generate` from `apps/server/openapi.json`);
response types are hand-written against the route handlers. Both are exported:

```ts
import type { Contact, Enrollment, Journey, EnrollInput, WebhookEvent, paths } from '@opensequence/sdk';
```

## Development

```bash
pnpm --filter @opensequence/sdk generate   # regenerate the OpenAPI types
pnpm --filter @opensequence/sdk typecheck
pnpm --filter @opensequence/sdk test
pnpm --filter @opensequence/sdk build
```

Tests inject a fake `fetch`; nothing talks to a server.
