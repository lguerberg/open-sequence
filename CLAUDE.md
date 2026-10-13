# OpenSequence: working rules for agents

This repository (`github.com/lguerberg/open-sequence`) is one pnpm workspace. Run every command
from its root. The authoritative design is `docs/ARCHITECTURE.md`; build in the phase
order of its section 18, and a phase is done only when its acceptance test passes.

## Architecture (non-negotiable)

- DDD in every package: `src/domain` (entities, value objects, domain services, repository and
  provider interfaces), `src/application` (use cases, one file each), `src/infrastructure`
  (Drizzle repositories, adapters, HTTP). Dependencies point inward only; `pnpm lint` enforces it.
- `@opensequence/core` is pure: no I/O, no package imports. It owns the Definition aggregate and
  every port interface.
- `@opensequence/engine` owns entities, use cases and the Drizzle persistence of the `seq` schema.
- `queue`, `providers`, `auth` implement core's ports and never import `engine`.
- `apps/server` is the only composition root: Fastify routes call use cases, workers call use
  cases, nothing else wires anything.
- Drizzle for all persistence. The TypeScript schema is the source of truth; `pnpm db:generate`
  writes migrations; the server applies them at boot. Use the query builder; `sql` fragments only
  where the builder cannot express the statement (the planner's SKIP LOCKED claim, aggregates).
- Registries, not switch statements: channels, node types, fact sources, providers and events are
  registered by name (docs/ARCHITECTURE.md section 20). Adding a module never edits the planner,
  `advance`, the signal pipeline or the API.
- Secrets are write-only: encrypted on arrival under `SEQ_ENCRYPTION_KEYS`, never returned by any
  endpoint, never logged.

## Conventions

- TypeScript strict, ESM, Node 22. Zod 4 for every boundary; Fastify with the Zod type provider so
  routes are also the OpenAPI file.
- Tests with Vitest. Engine integration tests run against a real Postgres (see `test/db.ts`);
  provider tests use recorded fixtures; the `mock` provider runs everything else.
- Prefixed ULID ids as primary keys (`ctc_…`, `enr_…`); `project_id` on every tenant-owned table.
- Plain-English error messages with a stable `code`.
- Commit only when asked. Show the work first.

## Commands

```bash
pnpm install
pnpm dev            # server with SEQ_ROLES=all, mock providers
pnpm test           # all packages
pnpm lint           # boundaries and style
pnpm typecheck
pnpm db:generate    # Drizzle migrations for engine and auth
pnpm oseq -- --help # the CLI
```
