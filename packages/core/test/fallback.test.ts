import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { leanToLatex, taggedTextToLatex, texttt } from '../src';

const katexOk = (tex: string) => () => katex.renderToString(tex, { throwOnError: true, strict: 'ignore' });

describe('texttt fallback', () => {
  it('escapes LaTeX specials and survives KaTeX', () => {
    for (const s of ['a_b', '{x}', '#h', '50%', '$', 'a^b', '~', '\\', '&']) {
      expect(katexOk(texttt(s))).not.toThrow();
    }
  });

  it('accepts Unicode math symbols KaTeX rejects in text mode', () => {
    const s = '∫ ∑ ∏ → ↦ ∀ ∃ ⊢ ‖x‖ ⟨a, b⟩ ∘ n✝ x² ℝ α ≤ ∈ ⁻¹ «x»';
    expect(katexOk(texttt(s))).not.toThrow();
  });

  it('is never empty', () => {
    expect(leanToLatex('')).toBe('\\texttt{}');
    expect(taggedTextToLatex(undefined)).toBe('\\texttt{}');
  });
});

describe('per-subexpression fallback on TaggedText', () => {
  // `if n = 0 then 1 else f x`: the `if` is unsupported, but its parts still convert.
  const tt = {
    tag: [
      {},
      {
        append: [
          { text: 'if ' },
          { tag: [{}, { append: [{ tag: [{}, { text: 'n' }] }, { text: ' = ' }, { tag: [{}, { text: '0' }] }] }] },
          { text: ' then ' },
          { tag: [{}, { text: '1' }] },
          { text: ' else ' },
          { tag: [{}, { append: [{ tag: [{}, { text: 'f' }] }, { text: ' ' }, { tag: [{}, { text: 'x' }] }] }] },
        ],
      },
    ],
  };

  it('converts the convertible parts and keeps the rest as Lean text', () => {
    const tex = taggedTextToLatex(tt);
    expect(tex).toBe('\\texttt{if }n = 0\\texttt{ then }1\\texttt{ else }f\\left(x\\right)');
    expect(katexOk(tex)).not.toThrow();
  });
});
