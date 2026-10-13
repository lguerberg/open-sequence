/**
 * The interpreter: look at the current node, ask its registered node type what to do, return
 * effects. It never touches a database, the clock (it receives `now`) or a provider.
 */
import { registry } from '../definition/registry.js';
import type { RegisteredNode } from '../definition/registry.js';
import type { Definition, NodeBase } from '../definition/schema.js';
import type { InterpretContext, StepResult } from './effects.js';

export function nodeOf(def: Definition, id: string): RegisteredNode {
  const raw = def.nodes[id];
  if (!raw) throw new Error(`node "${id}" does not exist in this definition`);
  return toRegisteredNode(id, raw);
}

export function toRegisteredNode(id: string, raw: NodeBase): RegisteredNode {
  const node: RegisteredNode = { id, type: raw.type, params: raw.params ?? {}, next: raw.next };
  if (raw.name !== undefined) node.name = raw.name;
  if (raw.channel !== undefined) node.channel = raw.channel;
  if (raw.action !== undefined) node.action = raw.action;
  if (raw.branches_by_outcome !== undefined) node.branches_by_outcome = raw.branches_by_outcome;
  return node;
}

/** The target of a transition, or undefined when it is unwired (the sequence ends there). */
export function transition(node: RegisteredNode, key: string): string | undefined {
  return node.next[key];
}

export async function interpret(ctx: InterpretContext): Promise<StepResult> {
  const node = nodeOf(ctx.definition, ctx.state.currentNodeId);
  const spec = registry.node(node.type);
  if (!spec) throw new Error(`node type "${node.type}" is not registered`);
  ctx.factLog = [];
  const effects = await spec.interpret(node, ctx);
  return { effects, facts: ctx.factLog };
}
