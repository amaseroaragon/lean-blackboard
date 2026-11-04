// Identifier → LaTeX: Greek letters, subscripts (`x₁`, `x_1`), primes, inaccessible names (`n✝`).

const GREEK: Record<string, string> = {
  α: '\\alpha', β: '\\beta', γ: '\\gamma', δ: '\\delta', ε: '\\varepsilon', ζ: '\\zeta', η: '\\eta',
  θ: '\\theta', ι: '\\iota', κ: '\\kappa', μ: '\\mu', ν: '\\nu', ξ: '\\xi', π: '\\pi', ρ: '\\rho',
  σ: '\\sigma', τ: '\\tau', υ: '\\upsilon', φ: '\\varphi', χ: '\\chi', ψ: '\\psi', ω: '\\omega',
  Γ: '\\Gamma', Δ: '\\Delta', Θ: '\\Theta', Λ: '\\Lambda', Ξ: '\\Xi', Υ: '\\Upsilon', Φ: '\\Phi',
  Ψ: '\\Psi', Ω: '\\Omega',
};

const SUBSCRIPT_MAP: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  'ₐ': 'a', 'ₑ': 'e', 'ₒ': 'o', 'ₓ': 'x', 'ₔ': 'ə', 'ₕ': 'h', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm',
  'ₙ': 'n', 'ₚ': 'p', 'ₛ': 's', 'ₜ': 't', 'ᵢ': 'i', 'ᵣ': 'r', 'ᵤ': 'u', 'ᵥ': 'v', 'ⱼ': 'j',
};

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
};

/** Escapes characters that are special in LaTeX math mode. */
export function escapeMath(s: string): string {
  return s.replace(/[\\{}#$%&_^~]/g, (c) => {
    switch (c) {
      case '\\':
        return '\\backslash ';
      case '^':
        return '\\hat{}';
      case '~':
        return '\\sim ';
      default:
        return `\\${c}`;
    }
  });
}

/**
 * Renders an identifier. `head` marks the function position of an application, where
 * multi-letter names use `\operatorname` for correct spacing.
 */
export function identToLatex(name: string, symbols: Record<string, string>, head = false): string {
  const symbol = symbols[name];
  if (symbol !== undefined) return symbol;

  let rest = name;
  if (rest.startsWith('«') && rest.endsWith('»')) rest = rest.slice(1, -1);

  // Inaccessible name: `n✝`, `h✝¹`.
  let dagger = '';
  const dag = /✝([⁰¹²³⁴⁵⁶⁷⁸⁹]*)$/u.exec(rest);
  if (dag) {
    const digits = Array.from(dag[1], (c) => SUPERSCRIPT_DIGITS[c]).join('');
    dagger = `^{\\dagger${digits ? ` ${digits}` : ''}}`;
    rest = rest.slice(0, dag.index);
  }

  const primeMatch = /'+$/.exec(rest);
  const primes = primeMatch ? primeMatch[0] : '';
  if (primeMatch) rest = rest.slice(0, primeMatch.index);

  let sub = '';
  const chars = Array.from(rest);
  let cut = chars.length;
  while (cut > 1 && chars[cut - 1] in SUBSCRIPT_MAP) cut--;
  if (cut < chars.length) {
    sub = chars.slice(cut).map((c) => SUBSCRIPT_MAP[c]).join('');
    rest = chars.slice(0, cut).join('');
  } else {
    // ASCII subscript only for a single-letter base: `x_1`, `a_n`.
    const m = /^(\p{L})_([\p{L}\d]+)$/u.exec(rest);
    if (m) {
      rest = m[1];
      sub = m[2];
    }
  }

  const base = baseToLatex(rest, symbols, head);
  const out = base + (sub ? `_{${escapeMath(sub)}}` : '') + primes + dagger;
  // Avoid "double superscript" errors if the caller appends `^{…}`.
  return dagger ? `{${out}}` : out;
}

function baseToLatex(base: string, symbols: Record<string, string>, head: boolean): string {
  const symbol = symbols[base];
  if (symbol !== undefined) return symbol;
  const chars = Array.from(base);
  if (chars.length === 1) return GREEK[base] ?? escapeMath(base);
  return head ? `\\operatorname{${escapeMath(base)}}` : `\\mathrm{${escapeMath(base)}}`;
}
