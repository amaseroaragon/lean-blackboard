// Precise mode: wire format of the companion Lean package's RPC method
// `LeanBlackboard.getGoalsLatex` (see `lean/LeanBlackboard/Rpc.lean`).

import type { DefinitionView, GoalView, HypView, SubexprView } from './protocol';
import { identToLatex } from './render/ident';
import type { Rules } from './rules/types';

export const PRECISE_METHOD = 'LeanBlackboard.getGoalsLatex';
export const PRECISE_EXPRS_METHOD = 'LeanBlackboard.exprsLatex';
export const PRECISE_PROTOCOL_VERSION = 5;

/** Lake package name of the companion package (`lean/lakefile.toml`). */
export const COMPANION_PACKAGE = 'LeanBlackboard';

const lakeName = (n: unknown): string | undefined =>
  typeof n === 'string' ? n.replace(/^«(.*)»$/, '$1') : undefined;

/**
 * Whether a Lake project (given its parsed `lake-manifest.json`) can import the companion
 * package: it is the package itself or one of its (transitive, resolved) dependencies.
 * If not, precise mode can never be available there, so the extension must not even probe it:
 * asking Lean for an unknown user RPC method makes it scan every snapshot of the file, which
 * while elaborating logs "`Task.get` called from a `(sync := true)` task" (a Lean core issue).
 */
export function manifestHasCompanion(manifest: unknown): boolean {
  if (typeof manifest !== 'object' || manifest === null) return false;
  const m = manifest as { name?: unknown; packages?: unknown };
  if (lakeName(m.name) === COMPANION_PACKAGE) return true;
  return Array.isArray(m.packages) && m.packages.some((p: unknown) =>
    typeof p === 'object' && p !== null && lakeName((p as { name?: unknown }).name) === COMPANION_PACKAGE);
}

/** `Rules` in the shape the Lean side expects (only `symbols` and `functions` apply there). */
export interface WireRules {
  symbols: { name: string; latex: string }[];
  functions: { name: string; arity: number; template: string }[];
}

export function rulesToWire(rules: Rules): WireRules {
  return {
    symbols: Object.entries(rules.symbols).map(([name, latex]) => ({ name, latex })),
    functions: Object.entries(rules.functions).map(([name, f]) => ({ name, arity: f.arity, template: f.template })),
  };
}

interface WireHyp {
  names: string[];
  type: string;
  typeLatex: string;
  val?: string;
  valLatex?: string;
  isInserted?: boolean;
  isRemoved?: boolean;
}

interface WireGoal {
  userName?: string;
  goalPrefix: string;
  hyps: WireHyp[];
  type: string;
  typeLatex: string;
  isInserted?: boolean;
  isRemoved?: boolean;
}

export class PreciseProtocolError extends Error {}

export interface PreciseView {
  goals: GoalView[] | null;
  termGoal?: GoalView;
  subexprs?: SubexprView[];
  goalsBefore?: GoalView[];
  definitions?: DefinitionView[];
}

/** Converts a `getGoalsLatex` response. Throws `PreciseProtocolError` on a version/shape mismatch. */
export function preciseGoalsToView(res: unknown, rules: Rules): PreciseView {
  if (res === null || res === undefined) return { goals: null };
  if (typeof res !== 'object' || !('goals' in res) || !Array.isArray(res.goals)) {
    throw new PreciseProtocolError('Unexpected getGoalsLatex response shape.');
  }
  const version = 'version' in res ? res.version : undefined;
  if (version !== PRECISE_PROTOCOL_VERSION) {
    throw new PreciseProtocolError(
      `Companion package protocol version ${String(version)}, expected ${PRECISE_PROTOCOL_VERSION}.`,
    );
  }
  const termGoal = 'termGoal' in res && res.termGoal ? goalToView(res.termGoal as WireGoal, rules) : undefined;
  const goals = (res.goals as WireGoal[]).map((g) => goalToView(g, rules));
  const subexprs = 'subexprs' in res && Array.isArray(res.subexprs) ? (res.subexprs as SubexprView[]) : undefined;
  const goalsBefore =
    'goalsBefore' in res && Array.isArray(res.goalsBefore)
      ? (res.goalsBefore as WireGoal[]).map((g) => goalToView(g, rules))
      : undefined;
  const definitions =
    'definitions' in res && Array.isArray(res.definitions) && res.definitions.length > 0
      ? (res.definitions as unknown[]).filter(isWireDefinition).map(definitionToView)
      : undefined;
  // Lean answers `goals: []` when it only has an expected type or definitions: that is
  // "no tactic state".
  const noTacticState = goals.length === 0 && (termGoal !== undefined || definitions !== undefined);
  return { goals: noTacticState ? null : goals, termGoal, subexprs, goalsBefore, definitions };
}

function isWireDefinition(d: unknown): d is DefinitionView {
  if (typeof d !== 'object' || d === null) return false;
  const x = d as Record<string, unknown>;
  return (
    typeof x.name === 'string' &&
    typeof x.nameLatex === 'string' &&
    typeof x.type === 'string' &&
    typeof x.typeLatex === 'string' &&
    Array.isArray(x.equations)
  );
}

function definitionToView(d: DefinitionView): DefinitionView {
  return {
    name: d.name,
    nameLatex: d.nameLatex,
    type: d.type,
    typeLatex: d.typeLatex,
    equations: d.equations
      .filter((e) => typeof e?.lean === 'string' && typeof e?.latex === 'string')
      .map((e) => ({ lean: e.lean, latex: e.latex })),
  };
}

function goalToView(g: WireGoal, rules: Rules): GoalView {
  return {
    kind: 'structured',
    userName: g.userName,
    prefix: g.goalPrefix,
    hyps: g.hyps.map((h) => hypToView(h, rules)),
    type: g.type,
    typeLatex: g.typeLatex,
    isInserted: g.isInserted === true,
    isRemoved: g.isRemoved === true,
  };
}

function hypToView(h: WireHyp, rules: Rules): HypView {
  const view: HypView = {
    names: h.names,
    namesLatex: h.names.map((n) => identToLatex(n, rules.symbols)).join(', '),
    type: h.type,
    typeLatex: h.typeLatex,
    isInserted: h.isInserted === true,
    isRemoved: h.isRemoved === true,
  };
  if (h.val !== undefined && h.valLatex !== undefined) {
    view.val = h.val;
    view.valLatex = h.valLatex;
  }
  return view;
}
