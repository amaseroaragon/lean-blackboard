// Pure conversion from Lean server responses to the panel's view model. No `vscode` import.
// Types are a minimal local subset of `lean4-infoview-api/src/rpcApi.ts`.

import type { GoalView, HypView } from './protocol';

/** `{ text } | { append: TaggedText[] } | { tag: [T, TaggedText] }`. */
export type TaggedText<T> = { text: string } | { append: TaggedText<T>[] } | { tag: [T, TaggedText<T>] };

/** The tag payload (`SubexprInfo`) is not used in plain-text mode. */
export type CodeWithInfos = TaggedText<unknown>;

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

/**
 * Concatenates all text leaves. Tolerant of unexpected nodes (they contribute nothing) so that a
 * server-side format change degrades the output instead of breaking the panel.
 */
export function flattenTaggedText(t: unknown): string {
  const out: string[] = [];
  const stack: unknown[] = [t];
  while (stack.length > 0) {
    const node = stack.pop();
    if (typeof node !== 'object' || node === null) continue;
    if ('text' in node && typeof node.text === 'string') {
      out.push(node.text);
    } else if ('append' in node && Array.isArray(node.append)) {
      for (let i = node.append.length - 1; i >= 0; i--) stack.push(node.append[i]);
    } else if ('tag' in node && Array.isArray(node.tag)) {
      stack.push(node.tag[1]);
    }
  }
  return out.join('');
}

/** Converts a `getInteractiveGoals` response. Throws if the shape is not recognised. */
export function interactiveGoalsToView(res: unknown): GoalView[] | null {
  if (res === null || res === undefined) return null;
  if (typeof res !== 'object' || !('goals' in res) || !Array.isArray(res.goals)) {
    throw new Error('Unexpected getInteractiveGoals response shape.');
  }
  return (res.goals as InteractiveGoal[]).map((g) => ({
    kind: 'structured',
    userName: g.userName,
    prefix: g.goalPrefix ?? '⊢ ',
    hyps: (g.hyps ?? []).map(hypToView),
    type: flattenTaggedText(g.type),
    isInserted: g.isInserted === true,
    isRemoved: g.isRemoved === true,
  }));
}

function hypToView(h: InteractiveHypothesisBundle): HypView {
  const view: HypView = {
    names: h.names ?? [],
    type: flattenTaggedText(h.type),
    isInserted: h.isInserted === true,
    isRemoved: h.isRemoved === true,
  };
  if (h.val !== undefined) view.val = flattenTaggedText(h.val);
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
