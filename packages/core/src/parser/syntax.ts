// Lean 4 notation precedences (how to PARSE). How to RENDER lives in `rules/`.
// Core values verified in lean4 v4.34.1 `Init/Notation.lean`, `Init/Core.lean`, `Init/Coe.lean`.
// Mathlib values (`√`, `∑`, `∏`, `|x|`) taken from its notation declarations.

export const MAX_PREC = 1024;
export const ARG_PREC = 1023;

export type Assoc = 'left' | 'right' | 'none';

export interface InfixSyntax {
  prec: number;
  assoc: Assoc;
  /** Canonical operator for rendering (ASCII spellings map to their Unicode form). */
  canonical?: string;
}

export const INFIX: Record<string, InfixSyntax> = {
  '↔': { prec: 20, assoc: 'none' },
  '<->': { prec: 20, assoc: 'none', canonical: '↔' },
  '→': { prec: 25, assoc: 'right' },
  '->': { prec: 25, assoc: 'right', canonical: '→' },
  '∨': { prec: 30, assoc: 'right' },
  '||': { prec: 30, assoc: 'left' },
  '⊕': { prec: 30, assoc: 'right' },
  '∧': { prec: 35, assoc: 'right' },
  '&&': { prec: 35, assoc: 'left' },
  '×': { prec: 35, assoc: 'right' },
  '=': { prec: 50, assoc: 'none' },
  '≠': { prec: 50, assoc: 'none' },
  '!=': { prec: 50, assoc: 'none', canonical: '≠' },
  '==': { prec: 50, assoc: 'none' },
  '<': { prec: 50, assoc: 'none' },
  '>': { prec: 50, assoc: 'none' },
  '≤': { prec: 50, assoc: 'none' },
  '<=': { prec: 50, assoc: 'none', canonical: '≤' },
  '≥': { prec: 50, assoc: 'none' },
  '>=': { prec: 50, assoc: 'none', canonical: '≥' },
  '≈': { prec: 50, assoc: 'none' },
  '≍': { prec: 50, assoc: 'none' },
  '∈': { prec: 50, assoc: 'none' },
  '∉': { prec: 50, assoc: 'none' },
  '⊆': { prec: 50, assoc: 'none' },
  '⊂': { prec: 50, assoc: 'none' },
  '⊇': { prec: 50, assoc: 'none' },
  '⊃': { prec: 50, assoc: 'none' },
  '∣': { prec: 50, assoc: 'none' },
  '+': { prec: 65, assoc: 'left' },
  '-': { prec: 65, assoc: 'left' },
  '++': { prec: 65, assoc: 'left' },
  '∪': { prec: 65, assoc: 'left' },
  '::': { prec: 67, assoc: 'right' },
  '*': { prec: 70, assoc: 'left' },
  '/': { prec: 70, assoc: 'left' },
  '%': { prec: 70, assoc: 'left' },
  '∩': { prec: 70, assoc: 'left' },
  '\\': { prec: 70, assoc: 'none' },
  '•': { prec: 73, assoc: 'right' },
  '^': { prec: 75, assoc: 'right' },
  '∘': { prec: 90, assoc: 'right' },
};

export interface PrefixSyntax {
  /** Precedence of the resulting term. */
  prec: number;
  /** Precedence at which the argument is parsed. */
  argPrec: number;
}

export const PREFIX: Record<string, PrefixSyntax> = {
  '¬': { prec: MAX_PREC, argPrec: 40 },
  '!': { prec: MAX_PREC, argPrec: 40 },
  '-': { prec: 75, argPrec: 75 },
  '↑': { prec: MAX_PREC, argPrec: MAX_PREC },
  '⇑': { prec: MAX_PREC, argPrec: MAX_PREC },
  '↥': { prec: MAX_PREC, argPrec: MAX_PREC },
  '#': { prec: MAX_PREC, argPrec: MAX_PREC },
  '√': { prec: 100, argPrec: 100 },
};

/** Postfix operators; all at max precedence (`⁻¹`, factorial `n !`). */
export const POSTFIX = new Set(['⁻¹', '!']);

export interface BinderSyntax {
  /** Precedence of the whole binder term. */
  prec: number;
  /** Precedence at which the body is parsed. */
  bodyPrec: number;
  /** Token separating binders from body. */
  separators: string[];
}

export const BINDERS: Record<string, BinderSyntax> = {
  '∀': { prec: 0, bodyPrec: 0, separators: [','] },
  '∃': { prec: 0, bodyPrec: 0, separators: [','] },
  '∃!': { prec: 0, bodyPrec: 0, separators: [','] },
  fun: { prec: 0, bodyPrec: 0, separators: ['=>', '↦'] },
  'λ': { prec: 0, bodyPrec: 0, separators: ['=>', '↦'] },
  // Mathlib big operators: `∑ x ∈ s, f x` is `term:67` with the body at 67.
  '∑': { prec: 67, bodyPrec: 67, separators: [','] },
  '∏': { prec: 67, bodyPrec: 67, separators: [','] },
};

/** Relations allowed as binder predicates (`∀ x ∈ s, …`, `∃ n > 0, …`). */
export const BINDER_PREDICATES = new Set(['∈', '∉', '⊆', '⊂', '⊇', '⊃', '<', '>', '≤', '≥', '≠']);

/** Keywords we do not support: their presence makes the parse fail (→ fallback), never misparse. */
export const UNSUPPORTED_KEYWORDS = new Set([
  'if', 'then', 'else', 'let', 'have', 'match', 'with', 'do', 'by', 'show', 'from', 'calc', 'at',
  'where', 'in', 'return', 'fun_prop',
]);

/** Prefix operators that may appear as function arguments without parentheses. */
export const ARG_PREFIX = new Set(['¬', '!', '↑', '⇑', '↥', '#']);
