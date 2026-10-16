/**
 * Validation: warnings on save, errors on publish. Every problem has a JSON path, a stable code and
 * a sentence a person or an agent can act on without reading a schema dump.
 */
import { definitionSchema, DEFINITION_LIMITS, type Definition } from './schema.js';
import { registry, type RegisteredNode, type ValidationProblem } from './registry.js';
import { toRegisteredNode } from '../interpreter/interpret.js';
import { isKnownRoot, REQUIRED_WITH_FALLBACK, templateRefs } from '../template/render.js';
import { ensureBuiltins } from './builtins.js';

export interface ValidationResult {
  ok: boolean;
  definition?: Definition;
  problems: ValidationProblem[];
}

const TEMPLATE_PARAMS = ['subject', 'body', 'title', 'link', 'text', 'note'];

export function validateDefinition(input: unknown): ValidationResult {
  ensureBuiltins();
  const problems: ValidationProblem[] = [];
  const bytes = Buffer.byteLength(JSON.stringify(input ?? null));
  if (bytes > DEFINITION_LIMITS.maxBytes) {
    return { ok: false, problems: [{ path: '', code: 'INVALID_DEFINITION', message: `The definition is ${Math.round(bytes / 1024)} KB; the limit is ${DEFINITION_LIMITS.maxBytes / 1024} KB.`, severity: 'error' }] };
  }
  const parsed = definitionSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      problems.push({ path: issue.path.join('.'), code: 'INVALID_DEFINITION', message: issue.message, severity: 'error' });
    }
    return { ok: false, problems };
  }
  const def = parsed.data;
  const ids = Object.keys(def.nodes);
  if (ids.length > DEFINITION_LIMITS.maxNodes) {
    problems.push({ path: 'nodes', code: 'INVALID_DEFINITION', message: `${ids.length} nodes; the limit is ${DEFINITION_LIMITS.maxNodes}.`, severity: 'error' });
  }
  const nodes: Record<string, RegisteredNode> = {};
  for (const id of ids) nodes[id] = toRegisteredNode(id, def.nodes[id]!);

  if (!nodes[def.entry]) {
    problems.push({ path: 'entry', code: 'UNKNOWN_NODE', message: `The entry node "${def.entry}" does not exist.`, severity: 'error' });
  }

  for (const node of Object.values(nodes)) {
    const base = `nodes.${node.id}`;
    const spec = registry.node(node.type);
    if (!spec) {
      problems.push({ path: `${base}.type`, code: 'UNKNOWN_NODE_TYPE', message: `"${node.type}" is not a node type. Available: ${[...registry.nodes.keys()].join(', ')}.`, severity: 'error' });
      continue;
    }
    if (node.type !== 'outreach') {
      const p = spec.params.safeParse(node.params);
      if (!p.success) {
        for (const issue of p.error.issues) {
          problems.push({ path: `${base}.params.${issue.path.join('.')}`, code: 'INVALID_DEFINITION', message: issue.message, severity: 'error' });
        }
      }
    }
    // transitions: targets exist, required ones are wired, keys are known
    const allowedKeys = new Set<string>(spec.transitions.keys);
    if (node.type === 'outreach' && node.channel && node.action) {
      const a = registry.channelAction(node.channel, node.action);
      if (a) for (const k of a.transitions.keys) allowedKeys.add(k);
    }
    for (const [key, target] of Object.entries(node.next)) {
      if (!allowedKeys.has(key) && node.type !== 'wait_for') {
        problems.push({ path: `${base}.next.${key}`, code: 'INVALID_DEFINITION', message: `"${key}" is not a transition of a ${spec.label} step. Use: ${[...allowedKeys].join(', ')}.`, severity: 'error' });
      }
      if (!nodes[target]) {
        problems.push({ path: `${base}.next.${key}`, code: 'UNKNOWN_NODE', message: `"${key}" points to "${target}", which does not exist.`, severity: 'error' });
      }
    }
    for (const [outcome, target] of Object.entries(node.branches_by_outcome ?? {})) {
      if (!nodes[target]) {
        problems.push({ path: `${base}.branches_by_outcome.${outcome}`, code: 'UNKNOWN_NODE', message: `"${outcome}" points to "${target}", which does not exist.`, severity: 'error' });
      }
    }
    for (const req of spec.transitions.required) {
      if (!node.next[req]) {
        problems.push({ path: `${base}.next.${req}`, code: 'MISSING_TRANSITION', message: `A ${spec.label} step must say where "${req}" goes.`, severity: 'error' });
      }
    }
    if (spec.terminal && Object.keys(node.next).length > 0) {
      problems.push({ path: `${base}.next`, code: 'INVALID_DEFINITION', message: `An ${spec.label} step has no next steps.`, severity: 'error' });
    }
    if (spec.validate) problems.push(...spec.validate(node, { nodes, factFields: (f) => registry.factField(f) }));

    // templates
    for (const key of TEMPLATE_PARAMS) {
      const value = node.params[key];
      if (typeof value !== 'string') continue;
      for (const ref of templateRefs(value)) {
        if (!isKnownRoot(ref.path)) {
          problems.push({ path: `${base}.params.${key}`, code: 'BAD_TEMPLATE', message: `"{{ ${ref.path} }}" is not something a template can read. Use contact.*, attrs.*, sender.*, sequence.name or unsubscribe_url.`, severity: 'error' });
        } else if (REQUIRED_WITH_FALLBACK.has(ref.path) && ref.fallback === undefined) {
          problems.push({ path: `${base}.params.${key}`, code: 'BAD_TEMPLATE', message: `"{{ ${ref.path} }}" can be empty for some contacts. Give it a fallback: {{ ${ref.path} | "there" }}.`, severity: 'error' });
        }
      }
    }
  }

  // graph: reachability and cycles without a timed wait
  if (nodes[def.entry]) {
    const reachable = new Set<string>();
    const stack = [def.entry];
    while (stack.length) {
      const id = stack.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      const n = nodes[id];
      if (!n) continue;
      for (const t of Object.values(n.next)) if (nodes[t]) stack.push(t);
      for (const t of Object.values(n.branches_by_outcome ?? {})) if (nodes[t]) stack.push(t);
    }
    for (const id of ids) {
      if (!reachable.has(id)) problems.push({ path: `nodes.${id}`, code: 'UNREACHABLE_NODE', message: `"${id}" can never be reached from the entry step.`, severity: 'error' });
    }
    const cycle = findUntimedCycle(nodes, def.entry);
    if (cycle) {
      problems.push({ path: `nodes.${cycle[0]}`, code: 'CYCLE', message: `Steps ${cycle.join(' → ')} loop without a wait in between; the contact would never leave them.`, severity: 'error' });
    }
  }

  const ok = !problems.some((p) => p.severity === 'error');
  return ok ? { ok, definition: def, problems } : { ok, problems };
}

/** A cycle is fine when at least one edge on it is a timed wait (wait, wait_for with a timeout, task). */
function findUntimedCycle(nodes: Record<string, RegisteredNode>, entry: string): string[] | null {
  const timed = (n: RegisteredNode) => n.type === 'wait' || n.type === 'task' || (n.type === 'wait_for' && !!n.params['timeout']);
  const state = new Map<string, 'visiting' | 'done'>();
  const path: string[] = [];
  const visit = (id: string): string[] | null => {
    const n = nodes[id];
    if (!n) return null;
    if (timed(n)) return null; // an edge through a timed node breaks the cycle
    const st = state.get(id);
    if (st === 'done') return null;
    if (st === 'visiting') return path.slice(path.indexOf(id)).concat(id);
    state.set(id, 'visiting');
    path.push(id);
    const targets = [...Object.values(n.next), ...Object.values(n.branches_by_outcome ?? {})];
    for (const t of targets) {
      const found = visit(t);
      if (found) return found;
    }
    path.pop();
    state.set(id, 'done');
    return null;
  };
  // Start from every untimed node reachable, since the entry may be timed.
  for (const id of Object.keys(nodes)) {
    const found = visit(id);
    if (found) return found;
  }
  void entry;
  return null;
}
