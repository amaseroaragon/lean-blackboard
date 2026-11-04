import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { goalToLatexArray, goalsToLatexDocument } from '../src';
import type { GoalView } from '../src';

const goal: GoalView = {
  kind: 'structured',
  userName: 'succ',
  prefix: '⊢ ',
  hyps: [
    { names: ['k'], namesLatex: 'k', type: 'ℕ', typeLatex: '\\mathbb{N}', isInserted: false, isRemoved: false },
    {
      names: ['ih'],
      namesLatex: '\\mathrm{ih}',
      type: '0 + k = k',
      typeLatex: '0 + k = k',
      isInserted: false,
      isRemoved: false,
    },
  ],
  type: '0 + (k + 1) = k + 1',
  typeLatex: '0 + \\left(k + 1\\right) = k + 1',
  isInserted: false,
  isRemoved: false,
};

describe('goalToLatexArray', () => {
  it('renders a sequent-style array that KaTeX accepts', () => {
    const tex = goalToLatexArray(goal);
    expect(tex).toBe(
      [
        '\\begin{array}{l}',
        '\\textbf{case } \\texttt{succ} \\\\',
        'k : \\mathbb{N} \\\\',
        '\\mathrm{ih} : 0 + k = k \\\\',
        '\\hline',
        '\\vdash 0 + \\left(k + 1\\right) = k + 1',
        '\\end{array}',
      ].join('\n'),
    );
    expect(() => katex.renderToString(tex, { throwOnError: true, strict: 'ignore' })).not.toThrow();
  });

  it('handles goals without hypotheses and plain fallback goals', () => {
    const bare: GoalView = { ...goal, userName: undefined, hyps: [] };
    expect(goalToLatexArray(bare)).toBe('\\begin{array}{l}\n\\vdash 0 + \\left(k + 1\\right) = k + 1\n\\end{array}');
    const plain = goalToLatexArray({ kind: 'plain', text: 'h : p\n⊢ q' });
    expect(() => katex.renderToString(plain, { throwOnError: true, strict: 'ignore' })).not.toThrow();
  });
});

describe('goalsToLatexDocument', () => {
  it('wraps each goal in display math with a comment', () => {
    const doc = goalsToLatexDocument([goal, { ...goal, userName: undefined }], goal);
    expect(doc).toMatch(/^% Goal 1 \(case succ\)\n\\\[\n\\begin\{array\}/);
    expect(doc).toContain('% Goal 2\n');
    expect(doc).toContain('% Expected type\n');
  });

  it('says when there is nothing to export', () => {
    expect(goalsToLatexDocument(null)).toBe('% No tactic state');
    expect(goalsToLatexDocument([])).toBe('% No goals');
  });
});
