// Precise mode: wire format of the companion Lean package's RPC method
// `LeanBlackboard.getGoalsLatex` (see `lean/LeanBlackboard/Rpc.lean`).

import type { GoalView, HypView, SubexprView } from './protocol';
import { identToLatex } from './render/ident';
import type { Rules } from './rules/types';

export const PRECISE_METHOD = 'LeanBlackboard.getGoalsLatex';
export const PRECISE_PROTOCOL_VERSION = 3;

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
  // Lean answers `goals: []` when it only has an expected type: that is "no tactic state".
  return { goals: goals.length === 0 && termGoal ? null : goals, termGoal, subexprs };
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
