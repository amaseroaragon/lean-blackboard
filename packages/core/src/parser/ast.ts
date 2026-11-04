// AST for the supported subset of Lean 4 terms.

export type Term =
  | { k: 'ident'; name: string }
  | { k: 'num'; text: string }
  | { k: 'str'; text: string }
  /** Parentheses present in the pretty-printed source. */
  | { k: 'paren'; inner: Term }
  /** `(e : T)`. */
  | { k: 'ascription'; term: Term; type: Term }
  | { k: 'app'; fn: Term; args: Term[] }
  /** `e.name` on a non-identifier (`(a + b).succ`). Dotted identifiers stay `ident`. */
  | { k: 'field'; obj: Term; name: string }
  | { k: 'binop'; op: string; lhs: Term; rhs: Term }
  | { k: 'prefix'; op: string; arg: Term }
  | { k: 'postfix'; op: string; arg: Term }
  /** `∀ ∃ ∃! ∑ ∏ fun`. */
  | { k: 'binder'; q: string; groups: BinderGroup[]; body: Term }
  /** `|x|`, `‖x‖`, `⌊x⌋`, `⌈x⌉`. */
  | { k: 'delim'; open: string; close: string; inner: Term }
  /** `(a, b)`, `⟨a, b⟩`, `[a, b]`, `{a, b}`. */
  | { k: 'seq'; open: string; close: string; items: Term[] }
  /** `{x | p}`, `{x : T | p}`, `{x // p}`. */
  | { k: 'setOf'; name: string; type?: Term; body: Term };

export interface BinderGroup {
  /** Empty for anonymous instance binders (`[Foo α]`). */
  names: string[];
  type?: Term;
  /** Binder predicate: `x ∈ s`, `x > 0`. */
  pred?: { op: string; rhs: Term };
  /** `(`, `{`, `[`, `⦃` or `` for unbracketed binders. */
  bracket: string;
}
