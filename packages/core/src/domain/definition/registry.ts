/**
 * Registries are the extension points. The engine never holds a list of channels or node types;
 * it asks these registries by name. Adding a module means registering, not editing.
 *
 *   registerNode     a node type: its params schema, transitions, and how to interpret it
 *   registerChannel  an outreach channel: its actions, each with params and transitions
 *   registerFacts    a prefix of condition fields and how they are typed
 *
 * Built-ins register themselves in ./builtins.ts; a module registers its own at boot.
 */
import type { z } from 'zod';
import type { Effect, InterpretContext } from '../interpreter/effects.js';

export interface TransitionSpec {
  /** Transition keys this node emits, in the order a canvas should show them. */
  keys: readonly string[];
  /** Keys that must be wired; the others may be left unwired (unwired = the sequence ends there). */
  required: readonly string[];
}

export interface NodeTypeSpec {
  type: string;
  /** Human label for pickers. */
  label: string;
  params: z.ZodType;
  transitions: TransitionSpec;
  /** A terminal node has no transitions at all. */
  terminal?: boolean;
  /** Extra validation beyond the schema (returns plain-English problems with a path). */
  validate?: (node: RegisteredNode, ctx: NodeValidationContext) => ValidationProblem[];
  /** The interpreter case for this node type. Pure: it returns effects. */
  interpret: (node: RegisteredNode, ctx: InterpretContext) => Promise<Effect[]>;
}

export interface ChannelActionSpec {
  action: string;
  label: string;
  params: z.ZodType;
  transitions: TransitionSpec;
  /** Whether executing this action counts as a touch (for attribution and touch numbers). */
  touch: boolean;
  validate?: (node: RegisteredNode, ctx: NodeValidationContext) => ValidationProblem[];
}

export interface ChannelSpec {
  name: string;
  label: string;
  actions: Record<string, ChannelActionSpec>;
  /** The queue the executor consumes; by convention seq_<channel>. */
  queue: string;
}

export type FactType = 'text' | 'number' | 'bool' | 'enum' | 'date';

export interface FactFieldSpec {
  field: string;
  label: string;
  type: FactType;
  /** For enum fields, the allowed values; a picker shows them. */
  values?: readonly string[];
}

export interface FactSourceSpec {
  /** The field prefix, like `contact`, `history`, `crm`. */
  prefix: string;
  label: string;
  fields: readonly FactFieldSpec[];
  /** When true, any `prefix.<path>` is accepted (the project declares types separately). */
  open?: boolean;
}

export interface ValidationProblem {
  path: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface RegisteredNode {
  id: string;
  type: string;
  name?: string;
  channel?: string;
  action?: string;
  params: Record<string, unknown>;
  next: Record<string, string>;
  branches_by_outcome?: Record<string, string>;
}

export interface NodeValidationContext {
  nodes: Record<string, RegisteredNode>;
  factFields: (field: string) => FactFieldSpec | undefined;
}

class Registry {
  readonly nodes = new Map<string, NodeTypeSpec>();
  readonly channels = new Map<string, ChannelSpec>();
  readonly facts = new Map<string, FactSourceSpec>();

  registerNode(spec: NodeTypeSpec): void {
    if (this.nodes.has(spec.type)) throw new Error(`node type "${spec.type}" is already registered`);
    this.nodes.set(spec.type, spec);
  }

  registerChannel(spec: ChannelSpec): void {
    if (this.channels.has(spec.name)) throw new Error(`channel "${spec.name}" is already registered`);
    this.channels.set(spec.name, spec);
  }

  registerFacts(spec: FactSourceSpec): void {
    if (this.facts.has(spec.prefix)) throw new Error(`fact source "${spec.prefix}" is already registered`);
    this.facts.set(spec.prefix, spec);
  }

  node(type: string): NodeTypeSpec | undefined {
    return this.nodes.get(type);
  }

  channel(name: string): ChannelSpec | undefined {
    return this.channels.get(name);
  }

  channelAction(channel: string, action: string): ChannelActionSpec | undefined {
    return this.channels.get(channel)?.actions[action];
  }

  factField(field: string): FactFieldSpec | undefined {
    const dot = field.indexOf('.');
    if (dot < 0) return undefined;
    const prefix = field.slice(0, dot);
    const source = this.facts.get(prefix);
    if (!source) return undefined;
    const exact = source.fields.find((f) => f.field === field);
    if (exact) return exact;
    if (source.open) return { field, label: field, type: 'text' };
    return undefined;
  }

  /** For tests and for modules that want a clean slate. */
  reset(): void {
    this.nodes.clear();
    this.channels.clear();
    this.facts.clear();
  }
}

export const registry = new Registry();
export type { Registry };
