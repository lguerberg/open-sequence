/**
 * Pulls the sources of truth into generated/ (docs/ARCHITECTURE.md section 19.1). Nobody edits the
 * output; `pnpm generate` runs before every dev server and build.
 *
 *   generated/openapi.json                         apps/server/openapi.json with a {baseUrl} server variable
 *   generated/content/api/<tag>/meta.json          order and title of every API reference tag folder
 *   generated/content/api/errors.mdx               the HTTP error envelope and every error code
 *   generated/content/reference/configuration.mdx  every SEQ_* variable, from the env Zod schema
 *   generated/content/docs/self-hosting/configuration.mdx   the same table with the queue and role notes
 *   generated/content/sdks/cli.mdx                 the oseq command tree, parsed from apps/server/src/cli.ts
 *   generated/content/reference/definition-schema.mdx       JSON Schema of the sequence definition
 *   generated/content/reference/nodes.mdx          every node type and channel action from the core registries
 *   generated/content/reference/condition-fields.mdx        the fact registry and the operators per type
 *   generated/content/reference/webhook-events.mdx the event catalogue
 *   generated/content/reference/error-codes.mdx    validation codes and HTTP error codes
 *
 * Run with tsx from the package folder. The core registries and the env schema are imported from
 * their source files; the CLI and the error codes are parsed from the files, because importing the
 * CLI would boot the server.
 */
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { envSchema } from '../../../apps/server/src/config/env.ts';
import { DEFINITION_LIMITS, definitionSchema, ensureBuiltins, OPERATORS_BY_TYPE, registry } from '../../core/src/index.ts';
import { EVENT_TYPES } from '../../engine/src/domain/shared/events.ts';
import { operationPageName, tagFolder } from '../lib/openapi-name.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, '..');
const repo = path.resolve(pkg, '../..');
const out = path.join(pkg, 'generated');
const content = path.join(out, 'content');

// ------------------------------------------------------------------ helpers
const GENERATED_NOTE = (source: string) => `<Note>This page is generated from \`${source}\` by \`pnpm generate\`. Do not edit it by hand; change the source and regenerate.</Note>`;

function frontmatter(title: string, description: string): string {
  return `---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\n---\n\n`;
}

/** Escapes a value for an MDX table cell or paragraph. */
function cell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/[{}<>]/g, (c) => `\\${c}`).replace(/\n/g, ' ');
}

function code(text: string): string {
  return `\`${text.replace(/`/g, '\u2018').replace(/\|/g, '\\|')}\``;
}

function table(headers: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n') + '\n';
}

async function write(rel: string, text: string): Promise<void> {
  const file = path.join(out, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
  console.log(`generated/${rel}`);
}

// ------------------------------------------------------------------ openapi.json
interface OpenApiDoc {
  openapi: string;
  info: Record<string, unknown>;
  servers?: unknown[];
  paths: Record<string, Record<string, { tags?: string[]; summary?: string }>>;
  [k: string]: unknown;
}

const TAG_TITLES: Record<string, { title: string; description: string }> = {
  Operator: { title: 'Operator', description: 'SEQ_ADMIN_TOKEN: projects, keys and platform health' },
  Project: { title: 'Project', description: 'Settings, provider credentials and API keys' },
  Engine: { title: 'Engine', description: 'This project\u2019s health and kill switches' },
  Senders: { title: 'Senders', description: 'The acting users, their Google connection and channels' },
  Contacts: { title: 'Contacts', description: 'The people who receive sequences' },
  Sequences: { title: 'Sequences', description: 'Sequences, versions, drafts and publishing' },
  Schema: { title: 'Schema', description: 'What a canvas or an agent reads first' },
  Enrollments: { title: 'Enrollments', description: 'Preview, enroll, pause, resume, exit, the journey' },
  Tasks: { title: 'Tasks', description: 'Manual steps for senders' },
  Analytics: { title: 'Analytics', description: 'Replies and meetings, per sequence, step and channel' },
  Webhooks: { title: 'Webhooks', description: 'Endpoints, deliveries, recovery and replay' },
};

/**
 * The server inlines the response envelope in every response of every route (no `$ref`), which
 * makes the document ten times bigger than it needs to be, and every API page embeds the whole
 * document. Hoist every schema that appears more than once into `components.schemas`.
 */
function hoistSharedSchemas(doc: OpenApiDoc): number {
  const counts = new Map<string, number>();
  const visit = (op: Record<string, unknown>, fn: (holder: Record<string, unknown>) => void) => {
    const responses = (op['responses'] ?? {}) as Record<string, { content?: Record<string, Record<string, unknown>> }>;
    for (const r of Object.values(responses)) for (const media of Object.values(r.content ?? {})) fn(media);
    const body = (op['requestBody'] as { content?: Record<string, Record<string, unknown>> } | undefined)?.content ?? {};
    for (const media of Object.values(body)) fn(media);
  };
  const ops: Array<Record<string, unknown>> = [];
  for (const methods of Object.values(doc.paths)) for (const op of Object.values(methods)) ops.push(op as unknown as Record<string, unknown>);
  for (const op of ops) visit(op, (media) => counts.set(JSON.stringify(media['schema']), (counts.get(JSON.stringify(media['schema'])) ?? 0) + 1));
  const names = new Map<string, string>();
  let n = 0;
  for (const [json, count] of counts) {
    if (count < 2 || json === 'undefined') continue;
    const schema = JSON.parse(json) as { properties?: Record<string, { const?: boolean; enum?: unknown[] }> };
    const props = schema.properties ?? {};
    const success = props['success']?.const ?? props['success']?.enum?.[0];
    const name =
      success === true ? 'SuccessEnvelope'
      : success === false ? 'ErrorEnvelope'
      : 'scopes' in props && 'name' in props ? 'ApiKeyBody'
      : 'first_name' in props && 'external_id' in props ? 'ContactWithExternalIdBody'
      : 'first_name' in props ? 'ContactBody'
      : 'contacts' in props && 'sender' in props ? 'EnrollBody'
      : `Shared${++n}`;
    names.set(json, name);
  }
  const components = ((doc['components'] ??= {}) as { schemas?: Record<string, unknown> });
  components.schemas ??= {};
  for (const [json, name] of names) components.schemas[name] = JSON.parse(json);
  let hoisted = 0;
  for (const op of ops) {
    visit(op, (media) => {
      const name = names.get(JSON.stringify(media['schema']));
      if (name) {
        media['schema'] = { $ref: `#/components/schemas/${name}` };
        hoisted++;
      }
    });
  }
  return hoisted;
}

async function generateOpenApi(): Promise<{ doc: OpenApiDoc; tags: string[] }> {
  const doc = JSON.parse(await readFile(path.join(repo, 'apps/server/openapi.json'), 'utf8')) as OpenApiDoc;
  hoistSharedSchemas(doc);
  doc.servers = [
    {
      url: '{baseUrl}',
      description: 'Your OpenSequence instance',
      variables: { baseUrl: { default: 'http://localhost:8080', description: 'The base URL of your OpenSequence deployment (SEQ_PUBLIC_URL), without /v1.' } },
    },
  ];
  // Tag objects with descriptions, in a fixed order; the API reference sidebar follows this order.
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const ops of Object.values(doc.paths)) {
    for (const op of Object.values(ops)) {
      for (const t of op.tags ?? []) {
        if (!seen.has(t)) {
          seen.add(t);
          ordered.push(t);
        }
      }
    }
  }
  const tags = Object.keys(TAG_TITLES).filter((t) => seen.has(t)).concat(ordered.filter((t) => !(t in TAG_TITLES)));
  doc['tags'] = tags.map((name) => ({ name, description: TAG_TITLES[name]?.description ?? '' }));
  await write('openapi.json', JSON.stringify(doc, null, 2));

  // One meta.json per tag folder, pages in the order the routes are declared.
  for (const tag of tags) {
    const pages: string[] = [];
    for (const [p, ops] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(ops)) {
        if ((op.tags ?? [])[0] === tag) pages.push(operationPageName(method, p));
      }
    }
    const info = TAG_TITLES[tag] ?? { title: tag, description: '' };
    await write(`content/api/${tagFolder(tag)}/meta.json`, JSON.stringify({ title: info.title, description: info.description, pages }, null, 2) + '\n');
  }
  return { doc, tags };
}

// ------------------------------------------------------------------ configuration (env schema)
interface EnvRow {
  name: string;
  type: string;
  required: string;
  def: string;
  description: string;
}

/** Descriptions are not in the schema (it has no .describe()), so they live here; the shape, defaults and enums come from the schema. */
const ENV_DESCRIPTIONS: Record<string, string> = {
  SEQ_DB_DSN: 'Postgres connection string. Only Postgres is supported. A transaction pooler is fine: no session-level features are used.',
  SEQ_QUEUE: 'The queue backend. `postgres` needs nothing else and is a transactional outbox; `redis` needs SEQ_REDIS_DSN; `memory` is for development and tests only.',
  SEQ_REDIS_DSN: 'Redis connection, required when SEQ_QUEUE=redis. Enable persistence on the Redis side.',
  SEQ_ENCRYPTION_KEYS: 'Encryption keys for every stored secret, `id:base64key[,id:base64key...]`; the first entry encrypts, every entry decrypts. Generate one with `oseq secrets new-key`. Back it up with the database: without it the stored secrets are unreadable and must be re-entered.',
  SEQ_ADMIN_TOKEN: 'The operator token that creates projects and keys (`/v1/admin/*`). Required by the `api` and `all` roles. Long and random.',
  SEQ_PUBLIC_URL: 'The base URL providers call back: inbound webhooks, the Google OAuth return and the opt-out links. The OpenAPI document served by the instance lists it as its server.',
  SEQ_PORT: 'HTTP port. The API for `api` and `all`; `/healthz` and `/readyz` only for `worker`.',
  SEQ_HOST: 'The interface to bind.',
  SEQ_ROLES: '`api` serves HTTP, `worker` runs the scheduler and the queue consumers, `all` does both in one process.',
  SEQ_RUN_MIGRATIONS: 'Apply the `seq` and `auth` migrations at boot, serialized by a row lock so replicas starting together do not race.',
  SEQ_CONCURRENCY: 'Messages in flight per queue per replica.',
  SEQ_DISABLED_CHANNELS: 'Platform-wide kill switch per channel, comma-separated (`sms`). Steps on a disabled channel are deferred, not skipped.',
  SEQ_PAUSED: 'Platform-wide stop: the planner claims nothing while it is on. In-flight steps finish.',
  SEQ_DEV_MOCK_PROVIDERS: 'Every project uses the `mock` adapters: nothing reaches Google, Allo or Attio, sends land in the timeline, and `POST /hooks/mock/{slug}` simulates replies, bounces, bookings and calls. Refused when NODE_ENV=production.',
  SEQ_LOG_LEVEL: 'Pino log level.',
  SEQ_METRICS: 'Reserved for a Prometheus `/metrics` endpoint. Accepted by the schema; the endpoint is not served yet.',
  SEQ_DB_POOL: 'Postgres connections per process.',
  NODE_ENV: '`production` turns off pretty logs and refuses SEQ_DEV_MOCK_PROVIDERS.',
};

interface ZodDef {
  type: string;
  innerType?: unknown;
  in?: unknown;
  out?: unknown;
  defaultValue?: unknown;
  entries?: Record<string, unknown>;
  coerce?: boolean;
  checks?: Array<{ _zod: { def: { check: string; format?: string } } }>;
}

function defOf(schema: unknown): ZodDef {
  return (schema as { _zod: { def: ZodDef } })._zod.def;
}

function describeEnv(schema: unknown): { type: string; optional: boolean; def: string } {
  const d = defOf(schema);
  switch (d.type) {
    case 'optional': {
      const inner = describeEnv(d.innerType);
      return { ...inner, optional: true };
    }
    case 'default': {
      const inner = describeEnv(d.innerType);
      const value = typeof d.defaultValue === 'function' ? (d.defaultValue as () => unknown)() : d.defaultValue;
      return { ...inner, optional: true, def: JSON.stringify(value) };
    }
    case 'pipe': {
      // `.transform()`: the input side says what the operator types; the output is a flag or a list.
      const inner = describeEnv(d.in);
      const outType = defOf(d.out).type;
      return { ...inner, type: outType === 'transform' ? 'string' : inner.type };
    }
    case 'enum':
      return { type: Object.keys(d.entries ?? {}).map((v) => `\`${v}\``).join(', '), optional: false, def: '' };
    case 'number':
      return { type: 'number', optional: false, def: '' };
    case 'string': {
      const url = d.checks?.some((c) => c._zod.def.check === 'string_format' && c._zod.def.format === 'url');
      return { type: url ? 'URL' : 'string', optional: false, def: '' };
    }
    default:
      return { type: d.type, optional: false, def: '' };
  }
}

const FLAGS = new Set(['SEQ_RUN_MIGRATIONS', 'SEQ_PAUSED', 'SEQ_DEV_MOCK_PROVIDERS', 'SEQ_METRICS']);
const LISTS = new Set(['SEQ_DISABLED_CHANNELS']);

function envRows(): EnvRow[] {
  const empty = envSchema.safeParse({});
  const requiredMessage = new Map<string, string>();
  if (!empty.success) for (const issue of empty.error.issues) requiredMessage.set(String(issue.path[0]), issue.message);
  const rows: EnvRow[] = [];
  for (const [name, schema] of Object.entries(envSchema.shape)) {
    const info = describeEnv(schema);
    let type = info.type;
    if (FLAGS.has(name)) type = 'flag: `1` or `true`';
    if (LISTS.has(name)) type = 'comma-separated list';
    let required = requiredMessage.has(name) ? 'yes' : 'no';
    if (name === 'SEQ_ADMIN_TOKEN') required = 'for `api` and `all`';
    if (name === 'SEQ_REDIS_DSN') required = 'with `SEQ_QUEUE=redis`';
    const description = ENV_DESCRIPTIONS[name];
    if (!description) throw new Error(`generate: ${name} is in the env schema but has no description in scripts/generate.ts; add one.`);
    rows.push({ name, type, required, def: info.def, description });
  }
  for (const name of Object.keys(ENV_DESCRIPTIONS)) {
    if (!(name in envSchema.shape)) throw new Error(`generate: ${name} is described in scripts/generate.ts but no longer in the env schema; remove it.`);
  }
  return rows;
}

function envTable(rows: EnvRow[]): string {
  return table(
    ['Variable', 'Type', 'Required', 'Default', 'Meaning'],
    rows.map((r) => [code(r.name), r.type, r.required, r.def ? code(r.def) : '', cell(r.description).replace(/\\`/g, '`')]),
  );
}

async function generateConfiguration(): Promise<void> {
  const rows = envRows();
  const tableText = envTable(rows);
  const source = 'apps/server/src/config/env.ts';
  await write(
    'content/reference/configuration.mdx',
    frontmatter('Configuration', 'Every SEQ_* variable the service reads, validated once at boot.') +
      GENERATED_NOTE(source) +
      '\n\nThe process refuses to start when a required value is missing or malformed, with a sentence that says which one. Values come from the environment only; there is no configuration file.\n\n' +
      tableText +
      '\nThree rules are checked after parsing: `SEQ_QUEUE=redis` needs `SEQ_REDIS_DSN`; the `api` and `all` roles need `SEQ_ADMIN_TOKEN`; `SEQ_DEV_MOCK_PROVIDERS` is refused when `NODE_ENV=production`.\n',
  );
  await write(
    'content/docs/self-hosting/configuration.mdx',
    frontmatter('Configuration', 'Every SEQ_* variable, the queue backends and the roles.') +
      GENERATED_NOTE(source) +
      `

Everything is configured through environment variables, Svix-style: you choose the database and the queue, and one image runs every role.

## Variables

${tableText}
Three rules are checked after parsing: \`SEQ_QUEUE=redis\` needs \`SEQ_REDIS_DSN\`; the \`api\` and \`all\` roles need \`SEQ_ADMIN_TOKEN\`; \`SEQ_DEV_MOCK_PROVIDERS\` is refused when \`NODE_ENV=production\`.

## Queue backends

The queue interface is \`send\`, \`read\` with a visibility timeout, \`release\`, \`delete\` and \`archive\`; everything above it is identical across backends.

| \`SEQ_QUEUE\` | Extra infrastructure | Notes |
|---|---|---|
| \`postgres\` | none | the default; the table \`seq.queue_messages\` with \`FOR UPDATE SKIP LOCKED\`; an enqueue joins the transaction that records the work (a transactional outbox) |
| \`redis\` | Redis 7+ | higher throughput for large installs; an enqueue cannot join the database transaction, so the reaper's sweep re-enqueues anything recorded but never queued |
| \`memory\` | none | development and tests only; the planner and the reaper rebuild work from the tables on boot |

Because the database is the truth and queue messages are hints, a lost or empty queue never loses work. See [Queues](/docs/self-hosting/queues).

## Roles

| \`SEQ_ROLES\` | Runs | Exposed publicly |
|---|---|---|
| \`api\` | the public API, inbound provider webhooks, the OAuth return, the opt-out page, \`/healthz\` and \`/readyz\` | yes |
| \`worker\` | the scheduler (planner, signals, poll, reaper, retention, webhooks) and the queue consumers (email, SMS, signals, deliveries) | no; it listens for \`/healthz\` and \`/readyz\` only |
| \`all\` | both in one process | yes |

A \`worker\` process still registers the API routes on its port; do not expose that port. Readiness for a worker also checks that the scheduler ran a job in the last two minutes.

## Kill switches

\`SEQ_PAUSED=1\` stops the planner platform-wide; \`SEQ_DISABLED_CHANNELS=sms\` defers every step of a channel. Both are read on every tick, so they take effect without a restart. Per-project switches exist too: \`PUT /v1/engine/flags/global\` and \`PUT /v1/engine/flags/channel:sms\` with \`{ "value": false }\`.
`,
  );
}

// ------------------------------------------------------------------ CLI (parsed from apps/server/src/cli.ts)
interface CliCommand {
  name: string;
  description: string;
  options: Array<{ flags: string; description: string; required: boolean; def?: string }>;
  children: CliCommand[];
}

function parseCli(text: string): CliCommand[] {
  const roots: CliCommand[] = [];
  const named = new Map<string, CliCommand>(); // `const projects = program.command('projects')`
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // Statements start with `program` or `<ident>` and end at the first `;` at depth zero.
  const statementRe = /(?:^|\n)\s*(?:const\s+(\w+)\s*=\s*)?(program|\w+)\s*\n?\s*\.command\(/g;
  let m: RegExpExecArray | null;
  while ((m = statementRe.exec(stripped)) !== null) {
    const assigned = m[1];
    const rootName = m[2]!;
    const start = m.index + m[0].length - '.command('.length;
    const end = findStatementEnd(stripped, start);
    const statement = stripped.slice(start, end);
    const parent = rootName === 'program' ? null : named.get(rootName);
    if (rootName !== 'program' && !parent) continue;
    const chain = parseChain(statement);
    if (!chain.length) continue;
    const first = chain[0]!;
    let target = parent ? parent.children : roots;
    let cmd = target.find((c) => c.name === first.name);
    if (!cmd) {
      cmd = first;
      target.push(cmd);
    } else {
      cmd.description ||= first.description;
      cmd.options.push(...first.options);
    }
    for (const sub of chain.slice(1)) {
      target = cmd!.children;
      cmd!.children.push(sub);
      cmd = sub;
    }
    if (assigned) named.set(assigned, chain[0]!);
  }
  return roots;
}

function findStatementEnd(text: string, from: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') depth--;
    else if (ch === ';' && depth === 0) return i;
  }
  return text.length;
}

/** `.command('a').description('x').option('-n, --name <n>', 'd').command('b')...` into a chain of commands. */
function parseChain(statement: string): CliCommand[] {
  const chain: CliCommand[] = [];
  const callRe = /\.(command|description|option|requiredOption|action|version|name)\(/g;
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(statement)) !== null) {
    const method = m[1]!;
    const argsStart = m.index + m[0].length;
    const argsEnd = matchParen(statement, argsStart - 1);
    const args = parseStringArgs(statement.slice(argsStart, argsEnd));
    callRe.lastIndex = argsEnd;
    const current = chain[chain.length - 1];
    switch (method) {
      case 'command':
        chain.push({ name: args[0] ?? '', description: '', options: [], children: [] });
        break;
      case 'description':
        if (current) current.description = args[0] ?? '';
        break;
      case 'option':
      case 'requiredOption':
        if (current) current.options.push({ flags: args[0] ?? '', description: args[1] ?? '', required: method === 'requiredOption', def: args[2] });
        break;
      default:
        break;
    }
  }
  return chain;
}

function matchParen(text: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return text.length;
}

function parseStringArgs(args: string): string[] {
  const outArgs: string[] = [];
  const re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  let m: RegExpExecArray | null;
  // Only the leading string literals count as arguments; a callback ends the list.
  const head = args.split(/\b(?:async\s*)?\(|=>/)[0] ?? args;
  while ((m = re.exec(head)) !== null) outArgs.push((m[1] ?? m[2] ?? m[3] ?? '').replace(/\\(.)/g, '$1'));
  return outArgs;
}

function renderCli(commands: CliCommand[], prefix = 'oseq'): string {
  let md = '';
  for (const c of commands) {
    const full = `${prefix} ${c.name}`;
    md += `### ${code(full)}\n\n${c.description ? cell(c.description) + '\n\n' : ''}`;
    if (c.options.length) {
      md += table(
        ['Option', 'Required', 'Default', 'Meaning'],
        c.options.map((o) => [code(o.flags), o.required ? 'yes' : 'no', o.def ? code(o.def) : '', cell(o.description)]),
      );
      md += '\n';
    }
    if (c.children.length) md += renderCli(c.children, full.split(' ').slice(0, 2).join(' ') === full ? full : full);
  }
  return md;
}

async function generateCli(): Promise<void> {
  const text = await readFile(path.join(repo, 'apps/server/src/cli.ts'), 'utf8');
  const commands = parseCli(text);
  if (!commands.length) throw new Error('generate: no commands parsed from apps/server/src/cli.ts');
  const versionMatch = /\.version\('([^']+)'\)/.exec(text);
  await write(
    'content/sdks/cli.mdx',
    frontmatter('oseq CLI', 'The operator CLI: migrations, projects, API keys, encryption keys and health.') +
      GENERATED_NOTE('apps/server/src/cli.ts') +
      `

\`oseq\` (version ${versionMatch?.[1] ?? '0.1.0'}) ships in the server image and in the \`@opensequence/server\` package. Every command is a thin wrapper over the same use cases the API exposes, so the docs for the API are the docs for the CLI. It reads the same \`SEQ_*\` environment as the server (it needs \`SEQ_DB_DSN\` and \`SEQ_ENCRYPTION_KEYS\`; \`SEQ_ADMIN_TOKEN\` is not needed).

\`\`\`bash
# in the image
docker compose exec opensequence node dist/cli.js projects create acme --name "Acme CRM"
# from the repository
pnpm oseq -- projects create acme --name "Acme CRM"
\`\`\`

## Commands

${renderCli(commands)}
<Warning>The architecture document also lists \`oseq secrets rotate\`, \`oseq webhooks replay\` and \`oseq queue dead list | replay\`. They are not implemented yet: rotate keys through the auth module's \`rotateKeys()\`, replay deliveries through \`POST /v1/webhooks/deliveries/\\{id\\}/replay\`.</Warning>
`,
  );
}

// ------------------------------------------------------------------ definition schema, nodes, channels, fields (core registries)
interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  description?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
}

function typeOf(s: JsonSchema): string {
  if (s.enum) return s.enum.map((v) => code(JSON.stringify(v))).join(', ');
  if (s.const !== undefined) return code(JSON.stringify(s.const));
  if (s.anyOf) return s.anyOf.map(typeOf).join(' or ');
  if (s.$ref) return code(s.$ref.replace('#/$defs/', ''));
  if (s.type === 'array') return `array of ${s.items ? typeOf(s.items) : 'any'}`;
  if (s.type === 'object' && !s.properties) return 'object';
  return Array.isArray(s.type) ? s.type.join(' or ') : (s.type ?? 'any');
}

function constraintsOf(s: JsonSchema): string {
  const parts: string[] = [];
  if (s.pattern) parts.push(`pattern ${code(s.pattern)}`);
  if (s.minLength !== undefined && s.minLength > 0) parts.push(`min length ${s.minLength}`);
  if (s.maxLength !== undefined) parts.push(`max length ${s.maxLength}`);
  if (s.minimum !== undefined) parts.push(`min ${s.minimum}`);
  if (s.maximum !== undefined) parts.push(`max ${s.maximum}`);
  if (s.minItems !== undefined) parts.push(`min items ${s.minItems}`);
  if (s.maxItems !== undefined) parts.push(`max items ${s.maxItems}`);
  if (s.description) parts.push(cell(s.description));
  return parts.join('; ');
}

function propertyTable(schema: JsonSchema): string {
  const props = schema.properties ?? {};
  if (!Object.keys(props).length) return '_No parameters._\n';
  const required = new Set(schema.required ?? []);
  return table(
    ['Param', 'Type', 'Required', 'Default', 'Constraints'],
    Object.entries(props).map(([name, p]) => [code(name), typeOf(p), required.has(name) ? 'yes' : 'no', p.default !== undefined ? code(JSON.stringify(p.default)) : '', constraintsOf(p)]),
  );
}

function toJson(schema: z.ZodType): JsonSchema {
  return z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' }) as JsonSchema;
}

async function generateDefinition(): Promise<void> {
  ensureBuiltins();
  const json = toJson(definitionSchema);
  await write(
    'content/reference/definition-schema.mdx',
    frontmatter('Definition schema', 'The JSON Schema of a sequence definition, generated from the Zod source of truth.') +
      GENERATED_NOTE('packages/core/src/domain/definition/schema.ts') +
      `

The same document is served by \`GET /v1/schema\` (with the node and channel catalogue) so a canvas, a script or an agent validates against what the service enforces. Node \`params\` are open here and validated per node type and channel action: see [Nodes and channels](/reference/nodes).

Limits: ${DEFINITION_LIMITS.maxNodes} nodes, ${DEFINITION_LIMITS.maxBytes / 1024} KB per definition, ${DEFINITION_LIMITS.maxSmsChars} characters per SMS body.

## Top level

${propertyTable(json)}
## settings

${propertyTable((json.properties?.['settings'] ?? {}) as JsonSchema)}
## settings.send_window

${propertyTable((json.properties?.['settings']?.properties?.['send_window'] ?? {}) as JsonSchema)}
## nodes.\\{id\\}

Node ids are \`lower_snake_case\`, up to 64 characters.

${propertyTable((json.properties?.['nodes']?.additionalProperties ?? {}) as JsonSchema)}
## JSON Schema

\`\`\`json
${JSON.stringify(json, null, 2)}
\`\`\`
`,
  );

  let nodesMd = '';
  for (const n of registry.nodes.values()) {
    const params = toJson(n.params);
    nodesMd += `### ${code(n.type)}: ${cell(n.label)}\n\n`;
    nodesMd += `Transitions: ${n.transitions.keys.length ? n.transitions.keys.map(code).join(', ') : 'none (terminal)'}${n.transitions.required.length ? `; required: ${n.transitions.required.map(code).join(', ')}` : ''}.\n\n`;
    nodesMd += n.type === 'outreach' ? 'Params are defined by the channel action; see [Channels](#channels).\n\n' : propertyTable(params) + '\n';
  }
  let channelsMd = '';
  for (const c of registry.channels.values()) {
    channelsMd += `### ${code(c.name)}: ${cell(c.label)}\n\nQueue ${code(c.queue)}.\n\n`;
    for (const a of Object.values(c.actions)) {
      channelsMd += `#### ${code(`${c.name} ${a.action}`)}: ${cell(a.label)}\n\n`;
      channelsMd += `Counts as a touch: ${a.touch ? 'yes' : 'no'}. Transitions: ${a.transitions.keys.map(code).join(', ')}.\n\n`;
      channelsMd += propertyTable(toJson(a.params)) + '\n';
    }
  }
  await write(
    'content/reference/nodes.mdx',
    frontmatter('Nodes and channels', 'Every registered node type and channel action: params, defaults and transitions.') +
      GENERATED_NOTE('packages/core/src/domain/definition/builtins.ts') +
      `

The engine holds no list of node types or channels: both are registries (docs/ARCHITECTURE.md section 20). \`GET /v1/schema\` serves the same catalogue. For examples of each node see [Nodes](/docs/sequences/nodes).

## Node types

${nodesMd}
## Channels

${channelsMd}`,
  );

  let fieldsMd = '';
  for (const s of registry.facts.values()) {
    fieldsMd += `### ${code(s.prefix + '.*')}: ${cell(s.label)}\n\n`;
    if (s.open) fieldsMd += `Open: any \`${s.prefix}.<path>\` is accepted and read as text unless the project declares a type (\`attrs_schema\` in the project settings for \`attrs.*\`; the Attio attribute types for \`crm.*\`).\n\n`;
    if (s.fields.length) {
      fieldsMd += table(
        ['Field', 'Label', 'Type', 'Operators', 'Values'],
        s.fields.map((f) => [code(f.field), cell(f.label), f.type, (OPERATORS_BY_TYPE[f.type] ?? []).map(code).join(', '), f.values ? f.values.map(code).join(', ') : '']),
      );
      fieldsMd += '\n';
    }
  }
  await write(
    'content/reference/condition-fields.mdx',
    frontmatter('Condition fields', 'The closed field registry conditions can read, with the operators per type.') +
      GENERATED_NOTE('packages/core/src/domain/definition/builtins.ts and packages/core/src/domain/conditions/evaluate.ts') +
      `

A condition is \`{ "mode": "all" | "any", "rules": [{ "field", "op", "value?" }] }\` with 1 to 20 rules. \`GET /v1/schema/fields\` serves this registry plus the project's \`attrs_schema\`. **Missing data never matches**: a \`null\` fact fails every operator, including \`is_not\` and \`ne\`, so the contact takes \`no\`. See [Conditions](/docs/sequences/conditions).

## Operators by type

${table(
  ['Type', 'Operators', 'Value'],
  Object.entries(OPERATORS_BY_TYPE).map(([type, ops]) => [code(type), ops.map(code).join(', '), ['bool'].includes(type) ? 'none' : type === 'text' ? 'a string; `is_empty` and `is_not_empty` take none' : type === 'number' ? 'a number' : type === 'date' ? 'an ISO date' : 'one of the field\u2019s values']),
)}
Text comparisons are case-insensitive. Numbers are compared after \`Number()\`; dates after \`Date.parse()\`.

## Fields

${fieldsMd}`,
  );
}

// ------------------------------------------------------------------ webhook events
interface EventDoc {
  when: string;
  payload: string;
}

/** Payload notes per event, from the use cases that raise them; the generator fails when an event has none. */
const EVENT_DOCS: Record<string, EventDoc> = {
  'enrollment.created': { when: 'after a successful enroll, one per contact', payload: '`enrollment` (id, sequence, version, contact, sender, status, mode, current_node_id, touch_count, enrolled_at, seq)' },
  'enrollment.exited': { when: 'an exit by rule (reply, meeting, opt-out, bounce, suppression) or by API', payload: '`enrollment`, `exit_reason` (`replied`, `meeting_booked`, `opt_out`, `bounced`, `suppressed`, `manual`, `deleted`), `signal` (the signal id, when one caused it), `label` (manual exits)' },
  'enrollment.completed': { when: 'an `end` node, an unwired transition, or a task completed with no next step', payload: '`enrollment`' },
  'enrollment.paused': { when: 'a manual pause, an out-of-office reply, or a step that failed with no `failed` transition', payload: '`enrollment`, `pause_reason` (`manual`, `ooo`, `step_failed`), `paused_until`' },
  'enrollment.resumed': { when: 'a manual resume or a pause whose `paused_until` passed', payload: '`enrollment`, `pause_reason` (the reason it had), `paused_until: null`' },
  'run.done': { when: 'an outreach step was sent', payload: '`run` (id, node_id, node_type, channel, action, status, touch_number, provider, provider_ref, branch, enrollment), `enrollment`' },
  'run.skipped': { when: 'a gate refused a step for good (no consent, no phone, suppressed, no channel, country not allowed, no time zone)', payload: '`run`, `reason`' },
  'run.failed': { when: 'a step ran out of retries or was stuck', payload: '`run`, `error`' },
  'run.needs_review': { when: 'the outcome of a send is unknown (an SMS that may or may not have left)', payload: '`run`, `error`' },
  'task.created': { when: 'a `task` node created a task for the sender', payload: '`task` (id, kind, title, body, link, due_at, expires_at, status, outcome, dialer, enrollment, contact, sender)' },
  'task.expired': { when: 'a task reached `expires_at` (the step takes `no_answer`) or was cancelled by an exit', payload: '`task` (the id only when expired by the timer; the full task when cancelled by an exit)' },
  'signal.received': { when: 'any signal was processed: reply, bounce, complaint, opt-out, meeting, call, task completion, client event', payload: '`signal` (id, kind, channel, source, occurred_at, attribution, attributed_run), `contact` (id, external_id, email, phone, first_name, last_name)' },
  'sender.channel_status': { when: 'a channel changed status (`credentials_needed`, `restricted`, back to `active`)', payload: '`sender`, `channel`, `status`' },
  'endpoint.disabled': { when: 'an endpoint failed every delivery for three days, or its secret can no longer be decrypted', payload: '`endpoint` (id, url, event_types, status, disabled_reason, disabled_at), `reason`' },
};

async function generateEvents(): Promise<void> {
  for (const t of EVENT_TYPES) if (!EVENT_DOCS[t]) throw new Error(`generate: event ${t} has no entry in EVENT_DOCS (scripts/generate.ts)`);
  for (const t of Object.keys(EVENT_DOCS)) if (!(EVENT_TYPES as readonly string[]).includes(t)) throw new Error(`generate: EVENT_DOCS documents ${t}, which is no longer an event type`);
  await write(
    'content/reference/webhook-events.mdx',
    frontmatter('Webhook events', 'The event catalogue: when each event fires and what its payload carries.') +
      GENERATED_NOTE('packages/engine/src/domain/shared/events.ts') +
      `

\`GET /v1/schema/events\` returns the same list. Every delivery body has the shape below; the fields in the table are inside \`data\`. Subscribe to \`"*"\` or to a list of types when you create an endpoint. See [Receiving webhooks](/docs/webhooks/overview).

\`\`\`json
{
  "id": "evt_01J9…",
  "type": "enrollment.exited",
  "project": "prj_01J9…",
  "enrollment": "enr_01J9…",
  "occurred_at": "2026-10-13T09:00:00.000Z",
  "data": { "enrollment": { "id": "enr_01J9…", "seq": 7, "...": "..." }, "exit_reason": "replied", "signal": "sig_01J9…" }
}
\`\`\`

${table(['Event', 'When', 'Payload (`data`)'], EVENT_TYPES.map((t) => [code(t), cell(EVENT_DOCS[t]!.when).replace(/\\`/g, '`'), EVENT_DOCS[t]!.payload.replace(/\|/g, '\\|')]))}
`,
  );
}

// ------------------------------------------------------------------ error codes (parsed from the sources)
interface ErrorCode {
  code: string;
  status: string;
  message: string;
  where: string;
}

const STATUS_BY_HELPER: Record<string, string> = { invalid: '422', conflict: '409', notFound: '404', forbidden: '403' };

async function listTs(dir: string): Promise<string[]> {
  const entries = await readdir(dir);
  const files: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e);
    const s = await stat(full);
    if (s.isDirectory()) {
      if (e === 'node_modules' || e === 'dist' || e === 'test') continue;
      files.push(...(await listTs(full)));
    } else if (e.endsWith('.ts') && !e.endsWith('.test.ts')) files.push(full);
  }
  return files;
}

function cleanMessage(raw: string): string {
  return raw.replace(/\$\{[^}]*\}/g, '…').replace(/\s+/g, ' ').trim();
}

async function scanErrorCodes(): Promise<{ validation: ErrorCode[]; http: ErrorCode[] }> {
  const validation = new Map<string, ErrorCode>();
  const http = new Map<string, ErrorCode>();
  const dirs = ['packages/core/src', 'packages/engine/src', 'packages/auth/src', 'apps/server/src'];
  const literal = `(?:'((?:[^'\\\\]|\\\\.)*)'|\`((?:[^\`\\\\]|\\\\.)*)\`|"((?:[^"\\\\]|\\\\.)*)")`;
  const helperRe = new RegExp(`\\b(invalid|conflict|forbidden)\\(\\s*'([A-Z_]+)',\\s*${literal}`, 'g');
  const domainRe = new RegExp(`new (?:DomainError|AuthError)\\(\\s*'([A-Z_]+)',\\s*${literal},\\s*(\\d{3})`, 'g');
  const failRe = new RegExp(`(?:fail\\(reply,\\s*(\\d{3}),\\s*\\{\\s*code:\\s*'([A-Z_]+)',\\s*message:\\s*${literal})`, 'g');
  const replyRe = new RegExp(`reply\\.status\\((\\d{3})\\)\\.send\\(\\{\\s*success:\\s*false,\\s*error:\\s*\\{\\s*code:\\s*'([A-Z_]+)',\\s*message:\\s*${literal}`, 'g');
  const problemRe = new RegExp(`code:\\s*'([A-Z_]+)',\\s*message:\\s*${literal},\\s*severity:\\s*'(error|warning)'`, 'g');
  for (const dir of dirs) {
    for (const file of await listTs(path.join(repo, dir))) {
      const text = await readFile(file, 'utf8');
      const where = path.relative(repo, file);
      const add = (map: Map<string, ErrorCode>, codeName: string, status: string, message: string) => {
        if (!map.has(codeName)) map.set(codeName, { code: codeName, status, message: cleanMessage(message), where });
      };
      let m: RegExpExecArray | null;
      while ((m = helperRe.exec(text)) !== null) add(http, m[2]!, STATUS_BY_HELPER[m[1]!] ?? '400', m[3] ?? m[4] ?? m[5] ?? '');
      while ((m = domainRe.exec(text)) !== null) add(http, m[1]!, m[5]!, m[2] ?? m[3] ?? m[4] ?? '');
      while ((m = failRe.exec(text)) !== null) add(http, m[2]!, m[1]!, m[3] ?? m[4] ?? m[5] ?? '');
      while ((m = replyRe.exec(text)) !== null) add(http, m[2]!, m[1]!, m[3] ?? m[4] ?? m[5] ?? '');
      if (dir === 'packages/core/src') while ((m = problemRe.exec(text)) !== null) add(validation, m[1]!, m[5]!, m[2] ?? m[3] ?? m[4] ?? '');
    }
  }
  // Codes the envelope produces itself, not through a helper.
  http.set('NOT_FOUND', { code: 'NOT_FOUND', status: '404', message: '… "…" was not found. (Also: no route for this method and path.)', where: 'packages/engine/src/domain/shared/errors.ts' });
  http.set('VALIDATION_ERROR', { code: 'VALIDATION_ERROR', status: '400', message: 'The request did not match the schema. `details` lists each path and message.', where: 'apps/server/src/http/envelope.ts' });
  http.set('INTERNAL_ERROR', { code: 'INTERNAL_ERROR', status: '500', message: 'Something went wrong on our side. Reference ….', where: 'apps/server/src/http/envelope.ts' });
  http.set('REQUEST_ERROR', { code: 'REQUEST_ERROR', status: '400, 413, 429', message: 'A request-level error with its own message: malformed JSON (400), a body over 2 MB (413), or "Rate limit exceeded, retry in …" (429, 600 requests per minute per key, with a `Retry-After` header).', where: 'apps/server/src/http/envelope.ts' });
  for (const [codeName, message] of Object.entries(ERROR_MESSAGE_OVERRIDES)) {
    const e = http.get(codeName);
    if (e) e.message = message;
  }
  const sortByCode = (a: ErrorCode, b: ErrorCode) => a.code.localeCompare(b.code);
  return { validation: [...validation.values()].sort(sortByCode), http: [...http.values()].sort(sortByCode) };
}

/** When the same code is raised from several places, the message shown is the general one. */
const ERROR_MESSAGE_OVERRIDES: Record<string, string> = {
  VERSION_NOT_EDITABLE: 'Version … is … and cannot be edited. Create a new version from it. (Also: only drafts can be deleted.)',
  UNAUTHORIZED: 'Send a project API key as a Bearer token. / This API key is unknown or revoked. / This endpoint needs the operator token.',
  INVALID_STATE: 'The OAuth state is malformed, its signature does not match, or it belongs to another connection. Start the connection again.',
  NOT_ACTIVE: 'This enrollment is … (only active and waiting_limit enrollments can be paused).',
  NOT_PAUSED: 'This enrollment is … (only paused and waiting_limit enrollments can be resumed).',
  INVALID_DEFINITION: 'The definition has errors; fix them before publishing. `details.problems` lists them.',
};

const ERROR_FIXES: Record<string, string> = {
  ALREADY_IN_SEQUENCE: 'Remove the listed contacts (`details.conflicts`) from the selection, or exit them first with `POST /v1/enrollments/{id}/exit`. Nobody was enrolled.',
  STALE_LOCK: 'Reload the version, re-apply your change on the new `lock_version`, save again.',
  VERSION_NOT_EDITABLE: 'Published and archived versions are frozen. Create a new draft from it: `POST /v1/sequences/{id}/versions` with `from_version`.',
  INSUFFICIENT_SCOPE: 'Use a key with the scope the route needs (`read` < `enroll` < `admin`).',
  UNAUTHORIZED: 'Send `Authorization: Bearer <key>`; the key must exist and not be revoked. `/v1/admin/*` wants the operator token instead.',
  HAS_ACTIVE_ENROLLMENTS: 'Exit them first, or send `exit_active: true` to exit them with reason `manual`.',
  NO_PUBLISHED_VERSION: 'Publish a version before enrolling.',
  UNSAFE_URL: 'Endpoint URLs must be `https`, carry no credentials, and resolve to a public address.',
  UNKNOWN_EVENT_TYPE: 'Use `"*"` or the types listed by `GET /v1/schema/events`.',
  INVALID_DEFINITION: 'Fix every problem in `details.problems` (each has a `path`, a `code` and a sentence) and publish again. Saving a draft with errors is allowed; publishing is not.',
  IDEMPOTENCY_MISMATCH: 'Not implemented: the `Idempotency-Key` header is accepted but ignored.',
};

async function generateErrors(): Promise<void> {
  const { validation, http } = await scanErrorCodes();
  const httpTable = table(
    ['Code', 'HTTP', 'Message', 'What to do'],
    http.map((e) => [code(e.code), e.status, cell(e.message), cell(ERROR_FIXES[e.code] ?? '')]),
  );
  const validationTable = table(
    ['Code', 'Severity', 'Example message'],
    validation.map((e) => [code(e.code), e.status, cell(e.message)]),
  );
  const envelope = `Every failure is the same envelope, with the HTTP status that matches the code:

\`\`\`json
{
  "success": false,
  "error": { "code": "ALREADY_IN_SEQUENCE", "message": "2 of the 142 contacts are already in a sequence. Nobody was enrolled. Remove them from the selection or exit them from their current sequence first.", "details": { "conflicts": [] } },
  "meta": { "request_id": "req_k3…" }
}
\`\`\`

Messages are plain English and may change; \`code\` is stable, so branch on it. \`details\` is structured when there is something to act on (the conflicts of \`ALREADY_IN_SEQUENCE\`, the \`problems\` of \`INVALID_DEFINITION\`, the \`missing\` scopes of \`SCOPES_MISSING\`). The TypeScript SDK throws \`OpenSequenceError\` with \`status\`, \`code\`, \`message\`, \`details\` and \`requestId\`.`;

  await write(
    'content/api/errors.mdx',
    frontmatter('Errors', 'The error envelope and every error code the API returns.') +
      GENERATED_NOTE('the error helpers in packages/engine, packages/auth and apps/server') +
      `

${envelope}

## HTTP error codes

${httpTable}
## Validation problems

Returned by \`POST /v1/sequences:validate\`, \`PUT .../draft\` (as \`problems\`, saving is allowed) and \`POST .../publish\` (inside a 422 \`INVALID_DEFINITION\`). Each problem is \`{ path, code, message, severity }\`. See [Validation](/docs/sequences/validation) for the fix of each one.

${validationTable}`,
  );
  await write(
    'content/reference/error-codes.mdx',
    frontmatter('Error codes', 'Every stable code: validation problems and HTTP errors.') +
      GENERATED_NOTE('the error helpers in packages/core, packages/engine, packages/auth and apps/server') +
      `

A search for a code lands here. HTTP errors come in the [error envelope](/api/errors); validation problems come in a \`problems\` array with a JSON path.

## Validation problems

${validationTable}
## HTTP error codes

${httpTable}`,
  );
}

// ------------------------------------------------------------------ main
async function main(): Promise<void> {
  await rm(out, { recursive: true, force: true });
  await mkdir(content, { recursive: true });
  await generateOpenApi();
  await generateConfiguration();
  await generateCli();
  await generateDefinition();
  await generateEvents();
  await generateErrors();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
