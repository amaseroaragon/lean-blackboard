import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { breakLatex, leanToLatex, splitTopLevel } from '../src';

const katexOk = (tex: string) => () => katex.renderToString(tex, { throwOnError: true, strict: 'ignore' });

describe('splitTopLevel', () => {
  it('splits at the loosest top-level operator', () => {
    expect(splitTopLevel('a \\land b \\Rightarrow c')).toEqual({
      parts: ['a \\land b', 'c'],
      ops: ['\\Rightarrow'],
      binder: false,
    });
  });

  it('never splits inside groups, \\left…\\right or environments', () => {
    expect(splitTopLevel('\\frac{a + b}{c}')).toBeUndefined();
    expect(splitTopLevel('\\left(a + b\\right)')).toBeUndefined();
    expect(splitTopLevel('\\left\\{ x \\mid x = 1 \\right\\}')).toBeUndefined();
    expect(splitTopLevel('\\begin{cases} a = b & c \\end{cases}')).toBeUndefined();
  });

  it('ignores a leading minus', () => {
    expect(splitTopLevel('-a')).toBeUndefined();
  });
});

describe('breakLatex', () => {
  const eps = leanToLatex('∀ ε > 0, ∃ δ > 0, ∀ (x : ℝ), |x - a| < δ → |f x - f a| < ε');

  it('leaves short formulas alone at depth 0', () => {
    expect(breakLatex(eps, 0)).toBe(eps);
  });

  it('breaks quantifier chains and implications into aligned lines', () => {
    const tex = breakLatex(eps, 2);
    expect(tex).toBe(
      [
        '\\begin{aligned}',
        '& \\forall \\varepsilon > 0, \\\\',
        '& \\quad \\exists \\delta > 0, \\\\',
        '& \\quad \\forall x \\in \\mathbb{R}, \\\\',
        '& \\quad \\left|x - a\\right| < \\delta \\\\',
        '& \\quad \\quad \\to \\left|f\\left(x\\right) - f\\left(a\\right)\\right| < \\varepsilon',
        '\\end{aligned}',
      ].join('\n'),
    );
    expect(katexOk(tex)).not.toThrow();
  });

  it('produces KaTeX-valid output at every depth for assorted goals', () => {
    const goals = [
      '(p → q) → (q → r) → p → r',
      'a ^ 2 + b ^ 2 + 2 * a * b = (a + b) ^ 2 ∧ a - b ≤ a + b',
      '∑ i ∈ Finset.range (n + 1), i = n * (n + 1) / 2',
      'if n = 0 then 1 else 2',
      '{x | x > 0 ∧ x < 1} ⊆ Set.Icc 0 1',
    ];
    for (const g of goals) {
      for (let d = 0; d <= 3; d++) expect(katexOk(breakLatex(leanToLatex(g), d))).not.toThrow();
    }
  });
});
