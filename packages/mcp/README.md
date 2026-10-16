# @opensequence/mcp

An [MCP](https://modelcontextprotocol.io) server for [OpenSequence](https://opensequence.dev). It lets
Claude Code, Cursor, Claude Desktop or any MCP client work with your sequences through the API, with
a scoped project key. Say "enroll these three people in UK intro with Max" and the agent finds the
sequence and the sender, previews the enrollment, and enrolls them.

It talks to the API through [`@opensequence/sdk`](../sdk) and nothing else, and it is built on
[FastMCP](https://github.com/PrefectHQ/fastmcp-ts). It runs two ways:

- **Hosted, over HTTP** (the default). One server for everyone. Each person's MCP client sends their
  own project key as `Authorization: Bearer sk_live_…`, and every call reaches the API with that key.
- **Local, over stdio** (`--stdio`). Your MCP client starts the server on your machine, with one key
  from the environment.

Either way the server decides nothing. The key's scopes do: a `read` key can list and preview, and
the write tools answer with the API's own refusal.

## Hosted (HTTP)

### Connect a client

Give the client the server's address and your key. The examples use `https://mcp.example.com/mcp`.

**Claude Code**

```bash
claude mcp add --transport http opensequence https://mcp.example.com/mcp \
  --header "Authorization: Bearer sk_live_..."
```

**Cursor**, in `.cursor/mcp.json` (this project) or `~/.cursor/mcp.json` (every project):

```json
{
  "mcpServers": {
    "opensequence": {
      "url": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer sk_live_…" }
    }
  }
}
```

**Claude Desktop** connects to a remote server with a custom header through
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote). In `claude_desktop_config.json` (Settings,
Developer, Edit Config):

```json
{
  "mcpServers": {
    "opensequence": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.example.com/mcp",
        "--header",
        "Authorization:${OPENSEQUENCE_AUTH}"
      ],
      "env": { "OPENSEQUENCE_AUTH": "Bearer sk_live_…" }
    }
  }
}
```

Or run the server locally over stdio instead (below).

### Run the server

```bash
OPENSEQUENCE_URL=https://sequences.example.com npx -y @opensequence/mcp
```

| Variable           | Meaning                                                                      | Default   |
| ------------------ | ---------------------------------------------------------------------------- | --------- |
| `OPENSEQUENCE_URL` | Your OpenSequence API, without `/v1`. Inside a cluster, its private address. | required  |
| `HOST`             | Interface to listen on.                                                      | `0.0.0.0` |
| `PORT`             | Port to listen on.                                                           | `8080`    |
| `MCP_PATH`         | Path of the MCP endpoint, the one clients are given.                         | `/mcp`    |
| `LOG_LEVEL`        | `debug`, `info`, `warn`, `error` or `silent`. Logs are JSON lines on stderr. | `info`    |

`GET /health` answers `200 ok` without a key, for load balancers and probes.

Every other request needs `Authorization: Bearer sk_…`. Without it, or with a bearer that is not
shaped like an OpenSequence key, the server answers `401` before any tool runs. It does not ask the
API whether the key is valid: the first tool call does, and a revoked key comes back as the API's
`UNAUTHORIZED`. The server is stateless, so you can run several behind one load balancer. Keys are
never logged.

### Docker

Build from the workspace root (the folder with `pnpm-lock.yaml`):

```bash
docker build -f packages/mcp/Dockerfile -t opensequence/mcp .
docker run -p 8080:8080 -e OPENSEQUENCE_URL=https://sequences.example.com opensequence/mcp
```

The image listens on port 8080, has a health check on `/health`, and always runs the HTTP transport.
To deploy it, point your platform at `packages/mcp/Dockerfile` with the workspace root as the build
context, expose port 8080, and set `OPENSEQUENCE_URL`.

## Local (stdio)

```bash
OPENSEQUENCE_URL=https://sequences.example.com \
OPENSEQUENCE_API_KEY=sk_live_… \
npx -y @opensequence/mcp --stdio
```

`MCP_TRANSPORT=stdio` does the same as `--stdio`. A flag on the command line wins over the variable.

| Variable               | Meaning                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `OPENSEQUENCE_URL`     | Your OpenSequence service, without `/v1` (for example `https://sequences.example.com`, or `http://localhost:8080` for `pnpm dev`). |
| `OPENSEQUENCE_API_KEY` | A project API key. See [Which key to give an agent](#which-key-to-give-an-agent).                                                  |
| `LOG_LEVEL`            | As above. Logs go to stderr, because stdout carries the protocol.                                                                  |

If either required variable is missing, the server exits with one line naming it. The key is never
printed or logged.

**Claude Code**

```bash
claude mcp add opensequence \
  -e OPENSEQUENCE_URL=https://sequences.example.com \
  -e OPENSEQUENCE_API_KEY=sk_live_… \
  -- npx -y @opensequence/mcp --stdio
```

**Claude Desktop** (`claude_desktop_config.json`) and **Cursor** (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "opensequence": {
      "command": "npx",
      "args": ["-y", "@opensequence/mcp", "--stdio"],
      "env": {
        "OPENSEQUENCE_URL": "https://sequences.example.com",
        "OPENSEQUENCE_API_KEY": "sk_live_…"
      }
    }
  }
}
```

## Tools

Senders, contacts and sequences can be named by their service id (`snd_…`, `ctc_…`, `seq_…`) or by
the external id your app gave them. Version arguments take an id (`ver_…`) or a tag (`v2`).

| Tool                           | What it does                                                                                                         | Scope  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------ |
| `list_sequences`               | Sequences with their versions and enrollment counts by status                                                        | read   |
| `get_sequence`                 | One sequence, its versions, and the steps of its default version (or another, by id or tag) with validation problems | read   |
| `validate_sequence_definition` | Checks a definition document without saving it; every problem with its path                                          | read   |
| `list_senders`                 | Senders with external id, email, time zone and status                                                                | read   |
| `get_sender_readiness`         | Which kinds of steps a sender can run now, and why not                                                               | read   |
| `upsert_contact`               | Creates or updates a contact by your external id; `attrs` deep-merged                                                | enroll |
| `get_contact`                  | One contact with suppressions and their current enrollment                                                           | read   |
| `list_contacts`                | Contacts, filtered by `email` or `external_id`                                                                       | read   |
| `get_contact_timeline`         | Messages, signals and tasks for one contact, newest first                                                            | read   |
| `preview_enrollment`           | Who would be enrolled, first touch times, who would be skipped and why; no writes                                    | read   |
| `enroll_contacts`              | Enrolls contacts (ids, external ids, or inline contacts) as one sender; `mode: dry_run` sends nothing                | enroll |
| `exit_enrollment`              | Ends an enrollment now with exit reason `manual`                                                                     | admin  |
| `get_enrollment_journey`       | One enrollment: every step that ran, the branch it took, messages, signals, tasks                                    | read   |
| `list_enrollments`             | Enrollments filtered by sequence, version, status, sender, contact, exit reason                                      | read   |
| `list_tasks`                   | Tasks sequences created for senders (calls, manual)                                                                  | read   |
| `complete_task`                | Marks a task done with an outcome, which wakes the waiting step                                                      | enroll |
| `analytics_summary`            | Replies and meetings for a sequence, with rates; without `sequence`, every sequence ranked                           | read   |
| `analytics_nodes`              | Results per step: reached, delivered, skipped by reason, replies, meetings                                           | read   |
| `report_contact_event`         | Tells OpenSequence about a meeting booked, an opt-out, a do-not-contact or a reply it could not see                  | enroll |

Every tool answers with a short plain-English summary first, then the API's JSON as a second
content block. A refusal comes back as an error result with the API's stable code and a message an
agent can act on. For example, enrolling someone who is already in a sequence returns:

```
ALREADY_IN_SEQUENCE: Dana Whitfield is already in a sequence ("UK facilities managers", enrollment enr_01J9…). Nobody was enrolled; exit that enrollment first (exit_enrollment) or pick another contact.
```

Arguments that do not match a tool's schema are refused the same way, before any request, with the
API's `VALIDATION_ERROR` code and the path of each problem.

The server also serves one resource, `opensequence://instructions`: how the tools fit together.

## Which key to give an agent

Create a key with the scope the agent needs, with the operator CLI or `POST /v1/api-keys` and an admin key:

```bash
pnpm oseq -- api-keys create <project_id> --scopes enroll --name claude-code
```

- **`enroll`** is the right default for agents. It can read everything, create and update contacts,
  enroll, complete tasks and report events. It cannot exit enrollments, change senders, sequences
  or project settings, or delete anything.
- **`read`** for an agent that only answers questions. Every tool is still listed; the write tools
  fail with the API's own message, for example `INSUFFICIENT_SCOPE: This key cannot do that; it needs the "enroll" scope.`
- **`admin`** only when the agent should also exit enrollments (`exit_enrollment`).

The key lives in your MCP client's configuration; treat that file like any other secret.

## Use it from code

```ts
import { createHttpServer, serveHttp, createStdioServer, serveStdio } from '@opensequence/mcp';

// Hosted: a bearer key on every request, one SDK client per call.
const server = createHttpServer({ url: 'https://sequences.example.com' });
await serveHttp(server, { host: '0.0.0.0', port: 8080, path: '/mcp' });

// Local: one key for every call.
await serveStdio(createStdioServer({ url: 'https://sequences.example.com', apiKey: 'sk_live_…' }));
```

`createServer({ client, auth })` is the transport-free core both use. It returns a FastMCP server.
`tools` (the definitions) and `toolNames` are exported too; pass `tools` to register a subset.

## Development

```bash
pnpm --filter @opensequence/mcp typecheck
pnpm --filter @opensequence/mcp test
pnpm --filter @opensequence/mcp build
# the API (pnpm dev) listens on 8080, so run the MCP server beside it on 8081
OPENSEQUENCE_URL=http://localhost:8080 HOST=127.0.0.1 PORT=8081 pnpm --filter @opensequence/mcp dev
```

Tests start the real HTTP server on a free local port and talk to it with FastMCP's client and with
plain JSON-RPC. A fake `fetch` stands in for the API, so nothing reaches a real service.
