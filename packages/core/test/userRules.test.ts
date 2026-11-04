import { describe, expect, it } from 'vitest';
import { defaultRules, leanToLatex, mergeUserRules, sanitizeMacros, templateArity } from '../src';

describe('templateArity', () => {
  it('returns the highest placeholder', () => {
    expect(templateArity('\\pi')).toBe(0);
    expect(templateArity('\\sinh #1')).toBe(1);
    expect(templateArity('\\binom{#1}{#2}')).toBe(2);
  });
});

describe('mergeUserRules', () => {
  it('adds and overrides rules without touching the base', () => {
    const { rules, warnings } = mergeUserRules(defaultRules, {
      symbols: { G: '\\mathcal{G}' },
      infix: { '→': '#1 \\Rightarrow #2' },
      functions: { 'Real.sinh': '\\sinh #1', 'Nat.choose': '\\binom{#1}{#2}' },
    });
    expect(warnings).toEqual([]);
    expect(leanToLatex('G', rules)).toBe('\\mathcal{G}');
    expect(leanToLatex('p → q', rules)).toBe('p \\Rightarrow q');
    expect(leanToLatex('Real.sinh x = y', rules)).toBe('\\sinh x = y');
    expect(leanToLatex('Nat.choose n 2', rules)).toBe('\\binom{n}{2}');
    // Base untouched.
    expect(leanToLatex('p → q')).toBe('p \\to q');
  });

  it('treats a function template without placeholders as a symbol', () => {
    const { rules } = mergeUserRules(defaultRules, { functions: { e: '\\mathrm{e}' } });
    expect(rules.symbols.e).toBe('\\mathrm{e}');
    expect(leanToLatex('e ^ x', rules)).toBe('\\mathrm{e}^{x}');
  });

  it('skips invalid entries with a warning instead of throwing', () => {
    const { rules, warnings } = mergeUserRules(defaultRules, {
      symbols: { x: 42, y: '#1' },
      infix: { '≡': '#1 \\equiv #2', '+': '#1 #2 #3' },
      prefix: { '¬': '\\lnot #1' },
      binders: { fun: '\\lambda' },
      colours: {},
      functions: { 'has space': '#1' },
    });
    expect(warnings).toHaveLength(7);
    expect(warnings.join('\n')).toMatch(/≡.*not an infix operator/);
    expect(rules.prefix['¬']).toBe('\\lnot #1');
    expect(rules.infix['+']).toBe(defaultRules.infix['+']);
  });

  it('ignores a non-object input', () => {
    expect(mergeUserRules(defaultRules, 'nope').warnings).toHaveLength(1);
    expect(mergeUserRules(defaultRules, undefined).warnings).toHaveLength(0);
  });
});

describe('sanitizeMacros', () => {
  it('keeps valid control sequences and warns about the rest', () => {
    const { macros, warnings } = sanitizeMacros({ '\\R': '\\mathbb{R}', R: 'x', '\\abs': 3, '\\n1': 'y' });
    expect(macros).toEqual({ '\\R': '\\mathbb{R}' });
    expect(warnings).toHaveLength(3);
  });
});
