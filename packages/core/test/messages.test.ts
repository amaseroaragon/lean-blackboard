import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { applyPreciseExprs, interactiveDiagnosticsToView } from '../src';

// Real responses from Lean v4.34.1 with `hasWidgets: true` (as the official client sets it).
const e = (code: unknown) => ({ tag: [{ expr: code }, { text: '' }] });
const t = (text: string) => e({ text });
const mismatch = {
  range: { start: { line: 1, character: 2 }, end: { line: 1, character: 9 } },
  severity: 1,
  message: {
    append: [
      t('Type mismatch'),
      t('\n  '),
      e({ tag: [{ info: { __rpcref: '0' }, subexprPos: '/' }, { text: 'h' }] }),
      t('\nhas type\n  '),
      e({
        tag: [
          { info: { __rpcref: '1' }, subexprPos: '/' },
          {
            append: [
              { tag: [{ info: { __rpcref: '2' }, subexprPos: '/0/1' }, { text: 'n' }] },
              { text: ' < ' },
              { tag: [{ info: { __rpcref: '3' }, subexprPos: '/1' }, { text: '5' }] },
            ],
          },
        ],
      }),
      t('\n'),
    ],
  },
};
const unsolved = {
  range: { start: { line: 3, character: 42 }, end: { line: 4, character: 0 } },
  severity: 1,
  message: {
    append: [
      t('unsolved goals'),
      t('\n'),
      {
        tag: [
          {
            goal: {
              ctx: { __rpcref: '17' },
              goalPrefix: '⊢ ',
              hyps: [{ fvarIds: ['_uniq.1', '_uniq.2'], names: ['a', 'b'], type: { text: 'Nat' } }],
              mvarId: '_uniq.4',
              type: { text: 'a + b = b + a' },
            },
          },
          { text: '' },
        ],
      },
    ],
  },
};

describe('interactiveDiagnosticsToView', () => {
  it('splits text and expressions, keeping the expression refs', () => {
    const { messages, exprRefs } = interactiveDiagnosticsToView([mismatch]);
    expect(messages).toEqual([
      {
        severity: 'error',
        line: 1,
        parts: [
          { kind: 'text', text: 'Type mismatch\n  ' },
          { kind: 'expr', latex: 'h', lean: 'h' },
          { kind: 'text', text: '\nhas type\n  ' },
          { kind: 'expr', latex: 'n < 5', lean: 'n < 5' },
        ],
      },
    ]);
    expect(exprRefs).toEqual([{ __rpcref: '0' }, { __rpcref: '1' }]);
  });

  it('renders embedded goals', () => {
    const { messages } = interactiveDiagnosticsToView([unsolved]);
    const [text, goal] = messages[0].parts;
    expect(text).toEqual({ kind: 'text', text: 'unsolved goals\n' });
    expect(goal).toMatchObject({ kind: 'goal', goal: { typeLatex: 'a + b = b + a', hyps: [{ namesLatex: 'a, b' }] } });
  });

  it('tolerates junk', () => {
    expect(interactiveDiagnosticsToView(null).messages).toEqual([]);
    expect(interactiveDiagnosticsToView([{ message: 42 }]).messages).toEqual([{ severity: 'information', line: 0, parts: [] }]);
  });

  it('applies precise LaTeX in order, keeping fast LaTeX for empty entries', () => {
    const { messages } = interactiveDiagnosticsToView([mismatch]);
    applyPreciseExprs(messages, ['', 'n < 5 \\land \\top']);
    const exprs = messages[0].parts.filter((p) => p.kind === 'expr');
    expect(exprs.map((p) => p.kind === 'expr' && p.latex)).toEqual(['h', 'n < 5 \\land \\top']);
    for (const p of exprs) {
      if (p.kind === 'expr') expect(() => katex.renderToString(p.latex, { throwOnError: true })).not.toThrow();
    }
  });
});
