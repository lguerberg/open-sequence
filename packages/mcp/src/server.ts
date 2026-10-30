/**
 * `createServer(options)`: a FastMCP server with every OpenSequence tool registered and no
 * transport yet. `http.ts` (hosted, the default) and `stdio.ts` (local) start it.
 *
 * Nothing is decided here. Each call runs with an SDK client that holds the caller's own key, and
 * the API's scopes decide what succeeds. Each tool answers with a short plain-English summary,
 * then the API's JSON; a refusal comes back as `isError` with a stable code and a message.
 */
import type { OpenSequence } from '@opensequence/sdk';
import { FastMCP, ToolResult } from '@prefecthq/fastmcp-ts/server';
import type {
  FrameworkLogLevel,
  Logger,
  TokenVerifier,
  ToolAnnotations,
} from '@prefecthq/fastmcp-ts/server';
import { z } from 'zod';
import type { Transport } from './config.js';
import type { ExplainedError } from './errors.js';
import { explainError } from './errors.js';
import type { ToolDefinition } from './tool.js';
import { ToolError, isWrite } from './tool.js';
import { tools as allTools } from './tools/index.js';

export const MCP_SERVER_NAME = 'opensequence';
export const MCP_SERVER_VERSION = '0.1.0';
export const USER_AGENT = `opensequence-mcp/${MCP_SERVER_VERSION}`;

/**
 * How the tools fit together. FastMCP has no option for the MCP `instructions` field, so this is
 * served as a resource (`opensequence://instructions`); the tool descriptions carry the same rules.
 */
export const MCP_INSTRUCTIONS = `OpenSequence runs multi-step outreach sequences (email, SMS, call tasks, LinkedIn connection requests the sender sends by hand) for a CRM.
- Senders, contacts and sequences can be named by their service id (snd_…, ctc_…, seq_…) or by the external id the CRM gave them.
- To enroll people: find the sequence (list_sequences) and the sender (list_senders), make sure the contacts exist (upsert_contact, or pass them inline), run preview_enrollment, then enroll_contacts.
- To build a sequence: write the definition and check it (validate_sequence_definition), create_sequence (v1 is a draft), save_sequence_draft to change it (read it first with get_sequence_version for its lock_version), then publish_sequence_version. A draft never sends anything.
- Published versions never change. To edit a live sequence, copy it into a new draft (create_sequence_version), save, and publish; contacts already enrolled finish the version they started.
- Email signatures live on the sender (upsert_sender, signature_html); a body ends with {{ sender.signature }} and should include {{ unsubscribe_url }}.
- A contact can be in only one active sequence. Enrolling is all or nothing: if anyone is already in a sequence, nobody is enrolled and the error names them.
- Every tool answers with a short summary, then the API's JSON.`;

/** A tool call's result as MCP clients receive it. */
export type CallToolResult = ToolResult['result'];

/**
 * Where a call's SDK client comes from: one client for every call (stdio, one key from the
 * environment), or a function that builds one from the caller's bearer key (hosted HTTP).
 */
export type ClientSource = OpenSequence | ((apiKey: string) => OpenSequence);

export interface CreateServerOptions {
  client: ClientSource;
  /** Checks the bearer of every HTTP request before any tool runs (see `apiKeyVerifier`). */
  auth?: TokenVerifier;
  /** The tools to register (default: all). */
  tools?: readonly ToolDefinition[];
  /** Framework logs, and one line per tool call. Without it: FastMCP's stderr logger, no call lines. */
  logger?: Logger;
  logLevel?: FrameworkLogLevel;
}

function annotations(tool: ToolDefinition): ToolAnnotations {
  if (!isWrite(tool)) return { title: tool.title, readOnlyHint: true };
  return {
    title: tool.title,
    readOnlyHint: false,
    destructiveHint: tool.hints?.destructive ?? false,
    idempotentHint: tool.hints?.idempotent ?? false,
  };
}

function scopeNote(tool: ToolDefinition): string {
  return tool.scope === 'read'
    ? 'Read-only.'
    : `Changes data; needs a key with the "${tool.scope}" scope.`;
}

// ------------------------------------------------------------------ input schemas

const inputs = new WeakMap<ToolDefinition, z.ZodObject<z.ZodRawShape>>();

function inputOf(tool: ToolDefinition): z.ZodObject<z.ZodRawShape> {
  let schema = inputs.get(tool);
  if (!schema) {
    schema = z.object(tool.input);
    inputs.set(tool, schema);
  }
  return schema;
}

/**
 * The JSON Schema clients are shown, made with this package's Zod. FastMCP could derive it from an
 * `input` validator, but its bundled Zod fails on five of these schemas and then sends a bare
 * `{ type: 'object' }`: clients show those tools with no arguments.
 */
function inputSchemaOf(tool: ToolDefinition): Record<string, unknown> {
  const schema: Record<string, unknown> = { ...z.toJSONSchema(inputOf(tool), { io: 'input' }) };
  delete schema['$schema'];
  return schema;
}

/**
 * Arguments are checked here rather than by FastMCP, which answers a bad argument with a JSON-RPC
 * error. As a tool error, with the API's VALIDATION_ERROR code and the path of each problem, the
 * agent sees what to fix and can retry, and no request reaches the API.
 */
function parseArgs(tool: ToolDefinition, args: unknown): unknown {
  const parsed = inputOf(tool).safeParse(args ?? {});
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.map((i) => ({
    path: i.path.map(String).join('.'),
    message: i.message,
  }));
  const list = issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; ');
  throw new ToolError('VALIDATION_ERROR', `Invalid arguments for ${tool.name}: ${list}.`, issues);
}

// ------------------------------------------------------------------ calls

interface Outcome {
  result: CallToolResult;
  error?: ExplainedError;
}

function refusal(e: ExplainedError): Outcome {
  return {
    error: e,
    result: {
      isError: true,
      content: [
        { type: 'text', text: `${e.code}: ${e.message}` },
        {
          type: 'text',
          text: JSON.stringify({
            error: {
              code: e.code,
              message: e.message,
              status: e.status,
              details: e.details,
              request_id: e.requestId,
            },
          }),
        },
      ],
    },
  };
}

async function run(tool: ToolDefinition, client: OpenSequence, args: unknown): Promise<Outcome> {
  try {
    const input = parseArgs(tool, args) as Parameters<ToolDefinition['run']>[1];
    const out = await tool.run(client, input);
    return {
      result: {
        content: [
          { type: 'text', text: out.summary },
          { type: 'text', text: JSON.stringify(out.data ?? null) },
        ],
      },
    };
  } catch (err) {
    return refusal(explainError(err));
  }
}

/** Runs one tool and shapes the MCP result: summary text, then JSON; or `isError` with code and message. */
export async function callTool(
  tool: ToolDefinition,
  client: OpenSequence,
  args: unknown
): Promise<CallToolResult> {
  return (await run(tool, client, args)).result;
}

function clientFor(source: ClientSource, apiKey: string | undefined): OpenSequence | undefined {
  if (typeof source !== 'function') return source;
  return apiKey ? source(apiKey) : undefined;
}

// ------------------------------------------------------------------ server

export function createServer(options: CreateServerOptions): FastMCP {
  const { client, auth, tools = allTools, logger, logLevel } = options;
  const server = new FastMCP({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
    auth,
    /*
      DNS-rebinding guards protect localhost servers that trust whoever reaches them. This one
      trusts nobody without a key, and a Host allowlist would only break when the domain changes.
    */
    dnsRebinding: { enabled: false },
    logger,
    logLevel,
  });

  for (const tool of tools) {
    server.tool(
      {
        name: tool.name,
        title: tool.title,
        description: `${tool.description} ${scopeNote(tool)}`,
        inputSchema: inputSchemaOf(tool),
        annotations: annotations(tool),
      },
      async (args: Record<string, unknown>) => {
        const started = Date.now();
        // Over HTTP the verifier ran before dispatch, so a key is always here; the guard is for
        // a ClientSource function used without `auth`.
        const sdk = clientFor(client, server.getContext().auth?.token);
        const { result, error } = sdk
          ? await run(tool, sdk, args)
          : refusal(
              explainError(
                new ToolError(
                  'UNAUTHORIZED',
                  'No API key came with this call. Send a project key: "Authorization: Bearer sk_live_…".'
                )
              )
            );
        logger?.info(`${tool.name} ${error ? `refused (${error.code})` : 'ok'}`, {
          tool: tool.name,
          ms: Date.now() - started,
          ...(error ? { code: error.code, status: error.status, request_id: error.requestId } : {}),
        });
        return new ToolResult(result);
      }
    );
  }

  server.resource(
    {
      uri: 'opensequence://instructions',
      name: 'instructions',
      title: 'Using the OpenSequence tools',
      description:
        'How the tools fit together: the ids they take, building and publishing a sequence, the enroll flow, and the one-active-sequence rule.',
      mimeType: 'text/markdown',
    },
    () => MCP_INSTRUCTIONS
  );

  return server;
}

/**
 * FastMCP's `run()` lets the MCP_TRANSPORT variable override the transport it is passed, and
 * throws on an empty one. Setting it to the transport already chosen keeps the two in agreement.
 */
export function pinTransport(transport: Transport): void {
  process.env['MCP_TRANSPORT'] = transport;
}
