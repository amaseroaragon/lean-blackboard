// Whole goal state as a LaTeX block, for pasting into notes or papers.

import type { DefinitionView, GoalView } from './protocol';
import { texttt } from './render/latex';
import { stripMarkers } from './render/markers';

/**
 * One `array` per goal: hypotheses, a rule, then the target (sequent style). Works in LaTeX
 * (`\[ … \]` blocks) and in KaTeX (the inner `array`).
 */
export function goalToLatexArray(goal: GoalView): string {
  if (goal.kind === 'plain') {
    const lines = goal.text.split('\n').map((l) => texttt(l));
    return `\\begin{array}{l}\n${lines.join(' \\\\\n')}\n\\end{array}`;
  }
  const rows: string[] = [];
  if (goal.userName) rows.push(`\\textbf{case } ${texttt(goal.userName)}`);
  for (const h of goal.hyps) {
    rows.push(`${h.namesLatex} : ${h.typeLatex}${h.valLatex !== undefined ? ` \\coloneqq ${h.valLatex}` : ''}`);
  }
  const target = `${goal.prefix.trim() === '⊢' ? '\\vdash' : texttt(goal.prefix.trim())} ${goal.typeLatex}`;
  const body = rows.length > 0 ? `${rows.join(' \\\\\n')} \\\\\n\\hline\n${target}` : target;
  return stripMarkers(`\\begin{array}{l}\n${body}\n\\end{array}`);
}

/** A definition as one `array`: signature, then one equation per row. */
export function definitionToLatexArray(def: DefinitionView): string {
  const rows = [`${def.nameLatex} : ${def.typeLatex}`, ...def.equations.map((e) => e.latex)];
  return stripMarkers(`\\begin{array}{l}\n${rows.join(' \\\\\n')}\n\\end{array}`);
}

/** Definitions as display-math blocks separated by blank lines. */
export function definitionsToLatexDocument(defs: DefinitionView[]): string {
  return `${defs.map((d) => `% Definition ${d.name}\n\\[\n${definitionToLatexArray(d)}\n\\]`).join('\n\n')}\n`;
}

/**
 * All goals (and the definitions and expected type, if any) as display-math blocks separated by
 * blank lines.
 */
export function goalsToLatexDocument(goals: GoalView[] | null, termGoal?: GoalView, definitions: DefinitionView[] = []): string {
  const blocks: string[] = definitions.map((d) => definitionsToLatexDocument([d]).trimEnd());
  (goals ?? []).forEach((g, i) => {
    const label = g.kind === 'structured' && g.userName ? ` (case ${g.userName})` : '';
    blocks.push(`% Goal ${i + 1}${label}\n\\[\n${goalToLatexArray(g)}\n\\]`);
  });
  if (termGoal) blocks.push(`% Expected type\n\\[\n${goalToLatexArray(termGoal)}\n\\]`);
  if (blocks.length === 0) return goals === null ? '% No tactic state' : '% No goals';
  return `${blocks.join('\n\n')}\n`;
}
