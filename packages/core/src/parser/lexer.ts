// Tokenizer for the subset of Lean 4 term syntax produced by the delaborator (pretty printer).

export type Token =
  | { kind: 'ident'; text: string }
  | { kind: 'num'; text: string }
  | { kind: 'str'; text: string }
  | { kind: 'op'; text: string }
  | { kind: 'eof'; text: '' };

export class ParseError extends Error {}

/**
 * Operator and punctuation tokens, longest first so that greedy matching works.
 * Anything not listed (and not an identifier/number/string) is a lexing error.
 */
const OPERATORS = [
  '<->', '⁻¹', '∃!', '::', '++', ':=', '=>', '==', '!=', '<=', '>=', '->', '&&', '||', '//',
  '≠', '≤', '≥', '→', '↔', '∧', '∨', '¬', '=', '<', '>', '∈', '∉', '⊆', '⊂', '⊇', '⊃', '∪', '∩',
  '\\', '+', '-', '*', '/', '%', '^', '•', '∘', '×', '∣', '≈', '≍', '⊕',
  '∑', '∏', '∀', '∃', '√', '↑', '⇑', '↥', '!', '#', '↦', 'λ', 'ᶜ',
  ',', ':', '|', '‖', '⌊', '⌋', '⌈', '⌉', '(', ')', '[', ']', '{', '}', '⟨', '⟩', '⦃', '⦄', '·', '@', '.',
].sort((a, b) => b.length - a.length);

/** Standalone symbols that behave like identifiers. */
const SYMBOL_IDENTS = new Set(['∅', '∞', '⊤', '⊥']);

const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉ₐₑₒₓₔₕₖₗₘₙₚₛₜᵢᵣᵤᵥⱼ';
const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** Letters Lean excludes from identifiers (they are notation): `λ Π Σ` and the complement `ᶜ`. */
const NON_IDENT_LETTERS = new Set(['λ', 'Π', 'Σ', 'ᶜ']);

function isLetter(c: string): boolean {
  return /\p{L}/u.test(c) && !NON_IDENT_LETTERS.has(c);
}

function isIdentStart(c: string): boolean {
  return isLetter(c) || c === '_';
}

function isIdentRest(c: string): boolean {
  return isIdentStart(c) || /\p{Nd}/u.test(c) || c === "'" || c === '!' || c === '?' || SUBSCRIPTS.includes(c);
}

export function tokenize(input: string): Token[] {
  const chars = Array.from(input); // code points, not UTF-16 units
  const tokens: Token[] = [];
  let i = 0;

  const peek = (k = 0): string => chars[i + k] ?? '';

  while (i < chars.length) {
    const c = chars[i];

    if (/\s/u.test(c)) {
      i++;
      continue;
    }

    // Metavariables (`?m.12`, `?u.85`, `?_`), e.g. universes in the statement of a lemma.
    if (c === '?' && (isIdentStart(peek(1)) || /\p{Nd}/u.test(peek(1)))) {
      let text = chars[i++];
      while (i < chars.length && (isIdentRest(peek()) || (peek() === '.' && /[\p{L}\p{Nd}_]/u.test(peek(1))))) {
        text += chars[i++];
      }
      tokens.push({ kind: 'ident', text });
      continue;
    }

    // Identifiers (possibly dotted: `Nat.succ`, `h.1`), `«quoted»` names, inaccessible `x✝¹`.
    if (isIdentStart(c) || c === '«') {
      let text = '';
      for (;;) {
        if (peek() === '«') {
          const end = chars.indexOf('»', i);
          if (end < 0) throw new ParseError('Unterminated «name»');
          text += chars.slice(i, end + 1).join('');
          i = end + 1;
        } else {
          while (i < chars.length && isIdentRest(peek())) text += chars[i++];
        }
        if (peek() === '✝') {
          text += chars[i++];
          while (SUPERSCRIPT_DIGITS.includes(peek()) && peek() !== '') text += chars[i++];
        }
        // Continue a dotted name only if the dot is glued to another segment.
        if (peek() === '.' && (isIdentStart(peek(1)) || peek(1) === '«' || /\p{Nd}/u.test(peek(1)))) {
          text += chars[i++];
          continue;
        }
        break;
      }
      tokens.push({ kind: 'ident', text });
      continue;
    }

    if (SYMBOL_IDENTS.has(c)) {
      tokens.push({ kind: 'ident', text: c });
      i++;
      continue;
    }

    if (/[0-9]/.test(c)) {
      let text = '';
      while (/[0-9]/.test(peek())) text += chars[i++];
      if (peek() === '.' && /[0-9]/.test(peek(1))) {
        text += chars[i++];
        while (/[0-9]/.test(peek())) text += chars[i++];
      }
      tokens.push({ kind: 'num', text });
      continue;
    }

    if (c === '"') {
      let text = c;
      i++;
      while (i < chars.length && peek() !== '"') {
        if (peek() === '\\') text += chars[i++];
        text += chars[i++] ?? '';
      }
      if (peek() !== '"') throw new ParseError('Unterminated string literal');
      text += chars[i++];
      tokens.push({ kind: 'str', text });
      continue;
    }

    const rest = chars.slice(i, i + 3).join('');
    let op = OPERATORS.find((o) => rest.startsWith(o));
    if (op === undefined) throw new ParseError(`Unexpected character '${c}'`);
    // Lean prints the boolean "or" with spaces around it (`a || b`); glued bars are nested
    // absolute values (`||a| - |b||`).
    if (op === '||' && !(i > 0 && /\s/u.test(chars[i - 1] ?? '') && /\s/u.test(peek(2)))) op = '|';
    tokens.push({ kind: 'op', text: op });
    i += Array.from(op).length;
  }

  tokens.push({ kind: 'eof', text: '' });
  return tokens;
}
