// Conversion from Lean server responses to the panel's view model.
// Types are a minimal local subset of `lean4-infoview-api/src/rpcApi.ts`.

import { taggedTextToLatex } from './convert';
import type { GoalView, HypView } from './protocol';
import { identToLatex } from './render/ident';
import { defaultRules } from './rules/defaultRules';
import type { Rules } from './rules/types';
import { CodeWithInfos, flattenTaggedText } from './taggedText';

export interface InteractiveHypothesisBundle {
  names: string[];
  type: CodeWithInfos;
  val?: CodeWithInfos;
  isInserted?: boolean;
  isRemoved?: boolean;
}

export interface InteractiveGoal {
  hyps: InteractiveHypothesisBundle[];
  type: CodeWithInfos;
  userName?: string;
  goalPrefix?: string;
  isInserted?: boolean;
  isRemoved?: boolean;
}

/** Converts a `getInteractiveGoals` response. Throws if the shape is not recognised. */
export function interactiveGoalsToView(res: unknown, rules: Rules = defaultRules): GoalView[] | null {
  if (res === null || res === undefined) return null;
  if (typeof res !== 'object' || !('goals' in res) || !Array.isArray(res.goals)) {
    throw new Error('Unexpected getInteractiveGoals response shape.');
  }
  return (res.goals as InteractiveGoal[]).map((g) => ({
    kind: 'structured',
    userName: g.userName,
    prefix: g.goalPrefix ?? '⊢ ',
    hyps: (g.hyps ?? []).map((h) => hypToView(h, rules)),
    type: flattenTaggedText(g.type),
    typeLatex: taggedTextToLatex(g.type, rules),
    isInserted: g.isInserted === true,
    isRemoved: g.isRemoved === true,
  }));
}

function hypToView(h: InteractiveHypothesisBundle, rules: Rules): HypView {
  const names = h.names ?? [];
  const view: HypView = {
    names,
    namesLatex: names.map((n) => identToLatex(n, rules.symbols)).join(', '),
    type: flattenTaggedText(h.type),
    typeLatex: taggedTextToLatex(h.type, rules),
    isInserted: h.isInserted === true,
    isRemoved: h.isRemoved === true,
  };
  if (h.val !== undefined) {
    view.val = flattenTaggedText(h.val);
    view.valLatex = taggedTextToLatex(h.val, rules);
  }
  return view;
}

/** Converts a `$/lean/plainGoal` response (`{ rendered, goals } | null`). */
export function plainGoalToView(res: unknown): GoalView[] | null {
  if (res === null || res === undefined) return null;
  if (typeof res !== 'object' || !('goals' in res) || !Array.isArray(res.goals)) {
    throw new Error('Unexpected plainGoal response shape.');
  }
  return res.goals.map((text) => ({ kind: 'plain', text: String(text) }));
}
