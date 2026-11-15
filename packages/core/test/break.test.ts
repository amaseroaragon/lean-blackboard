import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { breakLatex, breakToFit, leanToLatex, splitTopLevel } from '../src';

const katexOk = (tex: string) => () => katex.renderToString(tex, { throwOnError: true, strict: 'ignore' });

describe('splitTopLevel', () => {
  it('splits at the loosest top-level operator', () => {
    expect(splitTopLevel('a \\land b \\Rightarrow c')).toEqual({
      parts: ['a \\land b', 'c'],
      ops: ['\\Rightarrow'],
      binder: false,
      trailing: false,
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

describe('breakToFit', () => {
  /** Width proxy: visible characters (commands, braces and `&` alignment marks removed). */
  const visible = (l: string) =>
    l.replace(/\\(left|right)./g, 'x').replace(/\\quad /g, '  ').replace(/\\[A-Za-z]+/g, 'x').replace(/[{}&\s]/g, '').length;
  const fitsWithin = (w: number) => (l: string) => visible(l) <= w;
  const lines = (tex: string) =>
    tex.startsWith('\\begin{aligned}') ? tex.split('\n').slice(1, -1).map((l) => l.replace(/ \\\\$/, '')) : [tex];

  // Real goal from a proof about sums over a structure, after `simp only [...]`, fast mode.
  const real = "\\sum_{x} \\operatorname{M.alpha}\\left(x\\right) \\cdot \\left(c \\cdot \\left(x^{q + 1} \\cdot h^{q + 1}\\right)\\right) - h \\cdot \\sum_{x} \\operatorname{M.beta}\\left(x\\right) \\cdot \\left(c \\cdot \\left(q + 1\\right) \\cdot \\left(x^{q} \\cdot h^{q}\\right)\\right) = c \\cdot h^{q + 1} \\cdot \\left(\\sum_{j} \\operatorname{M.alpha}\\left(j\\right) \\cdot j^{q + 1} - \\left(q + 1\\right) \\cdot \\sum_{j} \\operatorname{M.beta}\\left(j\\right) \\cdot j^{q}\\right)";

  it('leaves formulas that fit unchanged', () => {
    expect(breakToFit('a + b = c', () => true)).toBe('a + b = c');
  });

  it('breaks a real long goal so that every line fits, in fewer lines than fixed depth', () => {
    const tex = breakToFit(real, fitsWithin(40));
    const ls = lines(tex);
    for (const l of ls) expect(visible(l)).toBeLessThanOrEqual(40);
    expect(ls.length).toBeLessThan(lines(breakLatex(real, 6)).length);
    expect(katexOk(tex)).not.toThrow();
  });

  it('packs pieces into a line while they fit', () => {
    const tex = breakToFit('a + b + c + d + e + f + g + h', fitsWithin(9));
    // `\\quad ` counts as 2: `a+b+c+d+e` and `··+f+g+h` are exactly 9 wide.
    expect(lines(tex)).toEqual(['& a + b + c + d + e', '& \\quad + f + g + h']);
  });

  it('splits argument lists at commas, never across arguments', () => {
    const tex = breakToFit('\\operatorname{f}\\left(aaaa + bbbb, cccc + dddd\\right)', fitsWithin(14));
    expect(lines(tex)[0]).toMatch(/aaaa \+ bbbb, \\right\.$/);
    expect(katexOk(tex)).not.toThrow();
  });

  it('keeps binder heads whole', () => {
    // Too narrow even for one head: heads are still not split at their relation.
    const tex = breakToFit(leanToLatex('∀ ε > 0, ∃ δ > 0, ∀ (x : ℝ), |x - a| < δ → |f x - f a| < ε'), fitsWithin(6));
    const ls = lines(tex);
    expect(ls.slice(0, 3)).toEqual([
      '& \\forall \\varepsilon > 0,',
      '& \\quad \\exists \\delta > 0,',
      '& \\quad \\forall x \\in \\mathbb{R},',
    ]);
    expect(katexOk(tex)).not.toThrow();
  });
});

describe('breakToFit inside group slots', () => {
  const visible = (l: string) =>
    l.replace(/\\(left|right)./g, 'x').replace(/\\quad /g, '  ').replace(/\\[A-Za-z]+/g, 'x').replace(/[{}&\s]/g, '').length;

  it('splits the content of `\\left({…}\\right)` (braces from a `{#1}` slot)', () => {
    const tex = breakToFit('P\\left({aaaa + bbbb + cccc}\\right)', (l) => visible(l) <= 12);
    expect(tex).toContain('\\right.');
    expect(() => katex.renderToString(tex, { throwOnError: true })).not.toThrow();
  });
});

describe('breakToFit: content that fits alone but not after its function', () => {
  const visible = (l: string) =>
    l.replace(/\\(left|right)./g, 'x').replace(/\\quad /g, '  ').replace(/\\[A-Za-z]+/g, 'x').replace(/[{}&\s]/g, '').length;

  it('splits `f(long)(a + b)` inside the last group', () => {
    // Real line from a polynomial goal: `(c (q + 1)) X^q` evaluated at `0 + x h`.
    const line = '\\cdot \\left(\\left(c \\cdot \\left(q + 1\\right)\\right) X^{q}\\right)\\left({0 + x \\cdot h}\\right)';
    // 22 wide: does not fit in 16, although `0 + x h` alone would.
    const tex = breakToFit(line, (l) => visible(l) <= 16);
    expect(tex).toBe(
      [
        '\\begin{aligned}',
        '& \\cdot \\left(\\left(c \\cdot \\left(q + 1\\right)\\right) X^{q}\\right)\\left( 0 \\right. \\\\',
        '& \\quad \\left. + x \\cdot h \\right)',
        '\\end{aligned}',
      ].join('\n'),
    );
    expect(() => katex.renderToString(tex, { throwOnError: true })).not.toThrow();
  });
});
