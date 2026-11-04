// Rendering rules: how each notation/constant is turned into LaTeX.
//
// Templates use `#1`, `#2`… for the rendered operands. A placeholder written exactly as `{#n}`
// is a "group slot": parentheses that only existed in the Lean source are dropped there
// (`(a + b) / c` → `\frac{a + b}{c}`). Elsewhere the source parentheses are kept.

export interface Rules {
  /** Identifier or symbol → LaTeX (`ℝ`, `Real` → `\mathbb{R}`). */
  symbols: Record<string, string>;
  /** Infix operator (canonical Unicode form) → template with `#1` (lhs) and `#2` (rhs). */
  infix: Record<string, string>;
  /** Prefix operator → template with `#1`. */
  prefix: Record<string, string>;
  /** Postfix operator → template with `#1`. */
  postfix: Record<string, string>;
  /** Fully qualified function → template; applied when called with at least `arity` args. */
  functions: Record<string, { arity: number; template: string }>;
  /** Binder head → LaTeX (`∀` → `\forall`). `fun` is rendered as `x \mapsto body`. */
  binders: Record<string, string>;
}
