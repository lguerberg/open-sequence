# Working on the OpenSequence MCP server

`packages/mcp` (`@opensequence/mcp`) is a thin MCP layer over the OpenSequence API, built on FastMCP
(`@prefecthq/fastmcp-ts`). It runs hosted over HTTP (its own container, `Dockerfile`, built from
the workspace root) or locally over stdio (`--stdio`). User docs: `README.md`.

## The rule

**Nothing is decided here.** Every tool calls the API through `@opensequence/sdk` with the
caller's own project key. Whether the key works, which scope it has (`read`, `enroll`, `admin`)
and every refusal are the API's answer. The only check made here is that an HTTP bearer looks
like a key (`sk_…`, `src/auth.ts`). If this server ever checks a scope, looks up a key or imports
anything from the service, there are two authorization surfaces, and they will drift. `pnpm lint`
rejects any `@opensequence/*` import other than the SDK.

## Layout

- `src/tool.ts`, `src/tools/*.ts`: what each tool is (name, description, Zod input shape, scope,
  `run`). They know nothing about MCP or FastMCP.
- `src/errors.ts`: any error a tool throws, as a stable code and a plain-English message.
- `src/server.ts`: `createServer`, the transport-free core. Registers every tool on FastMCP and
  shapes each answer: the summary block, then the JSON block; or `isError` with code and message.
- `src/http.ts`: the hosted server. `apiKeyVerifier` as FastMCP's `auth`, one SDK client per call
  built from the bearer (`server.getContext().auth.token`), stateless, `/health`.
- `src/stdio.ts`: the local server. One SDK client from `OPENSEQUENCE_API_KEY`.
- `src/cli.ts`, `src/config.ts`, `src/logger.ts`: the `opensequence-mcp` binary, its environment,
  and JSON logs on stderr.

## Adding a tool

1. The API route comes first, in `apps/server`, and the SDK method for it in `packages/sdk`.
2. Add a `defineTool` to the right file in `src/tools/` and list it in `src/tools/index.ts`. The
   name is a public contract: never rename one. Argument names and enums match the route's
   schema. Write the description at the agent: what the tool is FOR, which tool to call before or
   after it, and where it misleads. `scope` is the scope the API will demand, so the description
   can say it; it is not checked here.
3. `run` returns `{ summary, data }`: one or two lines a person could read, and the API's JSON.
4. Add a test in `src/server.test.ts`: what the tool sends to the API (through the fake fetch) and
   what it answers. Then call it through the running server and check the size of the answer. A
   tool that works and returns 40,000 characters is a bug: page it or filter it in the route.

## FastMCP: what it does not do for us

- **Input schemas.** FastMCP can derive a tool's JSON Schema from an `input` validator, but its
  bundled Zod (4.3) throws on five of ours (the ones with unions and records) and then sends a bare
  `{ type: 'object' }`, which clients show as a tool with no arguments. `server.ts` passes an
  explicit `inputSchema` made with this package's Zod instead. Tests assert every tool's schema
  has its properties; keep them.
- **Argument errors.** FastMCP answers a bad argument with a JSON-RPC error. We validate in
  `callTool` instead, so a bad argument is a tool error (`VALIDATION_ERROR` with each path) that an
  agent can read and fix, and no request reaches the API. That is why tools register without
  `input`.
- **Server instructions.** FastMCP has no `instructions` option. The text is served as the
  resource `opensequence://instructions`, and the tool descriptions carry the same rules.
- **MCP_TRANSPORT.** FastMCP's `run()` lets this variable override the transport it is given, and
  throws on an empty value. `serveHttp` and `serveStdio` set it to their own transport first.
- **401 bodies.** A missing bearer gets FastMCP's own `{"error":"Missing bearer token"}`. A bearer
  that is not a key gets the message thrown in `apiKeyVerifier`.

## Running it

```bash
pnpm dev   # the API on 8080, from the workspace root; then the MCP server beside it on 8081:
OPENSEQUENCE_URL=http://localhost:8080 HOST=127.0.0.1 PORT=8081 pnpm --filter @opensequence/mcp dev
curl -s localhost:8081/health
```

Make a key with `pnpm oseq -- api-keys create <project_id> --scopes enroll` and send it as
`Authorization: Bearer sk_live_…`. For stdio, add `--stdio` and `OPENSEQUENCE_API_KEY`.

## Deploying

- Build context: the workspace root. Dockerfile: `packages/mcp/Dockerfile` (its ignore file is
  `Dockerfile.dockerignore`). Port 8080. Health check: `/health`.
- Env: `OPENSEQUENCE_URL` (the API, its private address in the cluster), and optionally `HOST`,
  `PORT`, `MCP_PATH` (default `/mcp`), `LOG_LEVEL`. No secrets: callers bring their own keys.
