import { describe, expect, it } from 'vitest';
import { flattenTaggedText, interactiveGoalsToView, plainGoalToView } from '../src/goals';

// Real response captured from Lean v4.34.1 (`imp_trans`, cursor on `exact hpq hp`),
// with RPC refs in wire format v1 as the official client negotiates.
const impTrans = {
  goals: [
    {
      ctx: { __rpcref: '9' },
      goalPrefix: '⊢ ',
      hyps: [
        {
          fvarIds: ['_uniq.33.2', '_uniq.33.3', '_uniq.33.4'],
          isType: true,
          names: ['p', 'q', 'r'],
          type: { tag: [{ info: { __rpcref: '0' }, subexprPos: '/' }, { text: 'Prop' }] },
        },
        {
          fvarIds: ['_uniq.33.6'],
          names: ['hpq'],
          type: {
            tag: [
              { info: { __rpcref: '1' }, subexprPos: '/' },
              {
                append: [
                  { tag: [{ info: { __rpcref: '2' }, subexprPos: '/0' }, { text: 'p' }] },
                  { text: ' → ' },
                  { tag: [{ info: { __rpcref: '3' }, subexprPos: '/1' }, { text: 'q' }] },
                ],
              },
            ],
          },
        },
      ],
      isRemoved: true,
      mvarId: '_uniq.33.16',
      type: { tag: [{ info: { __rpcref: '8' }, subexprPos: '/' }, { text: 'q' }] },
    },
  ],
};

describe('flattenTaggedText', () => {
  it('concatenates text leaves in order', () => {
    expect(flattenTaggedText(impTrans.goals[0].hyps[1].type)).toBe('p → q');
  });

  it('handles plain text and nested appends', () => {
    expect(flattenTaggedText({ text: 'x' })).toBe('x');
    expect(flattenTaggedText({ append: [{ text: 'a' }, { append: [{ text: 'b' }, { text: 'c' }] }] })).toBe('abc');
  });

  it('ignores unknown nodes instead of throwing', () => {
    expect(flattenTaggedText({ append: [{ text: 'a' }, { weird: 1 }, null, { text: 'b' }] })).toBe('ab');
    expect(flattenTaggedText(undefined)).toBe('');
  });

  it('does not overflow on deeply nested input', () => {
    let t: unknown = { text: 'x' };
    for (let i = 0; i < 100_000; i++) t = { tag: [{}, t] };
    expect(flattenTaggedText(t)).toBe('x');
  });
});

describe('interactiveGoalsToView', () => {
  it('converts a real response', () => {
    expect(interactiveGoalsToView(impTrans)).toEqual([
      {
        kind: 'structured',
        userName: undefined,
        prefix: '⊢ ',
        hyps: [
          { names: ['p', 'q', 'r'], type: 'Prop', isInserted: false, isRemoved: false },
          { names: ['hpq'], type: 'p → q', isInserted: false, isRemoved: false },
        ],
        type: 'q',
        isInserted: false,
        isRemoved: true,
      },
    ]);
  });

  it('keeps let values and case names', () => {
    const res = {
      goals: [
        {
          userName: 'succ',
          hyps: [{ names: ['x'], type: { text: 'Nat' }, val: { text: '3' }, isInserted: true }],
          type: { text: 'x = 3' },
        },
      ],
    };
    const [g] = interactiveGoalsToView(res) ?? [];
    expect(g).toMatchObject({ kind: 'structured', userName: 'succ', prefix: '⊢ ', type: 'x = 3' });
    expect(g?.kind === 'structured' && g.hyps[0]).toEqual({
      names: ['x'],
      type: 'Nat',
      val: '3',
      isInserted: true,
      isRemoved: false,
    });
  });

  it('distinguishes no tactic state (null) from no goals ([])', () => {
    expect(interactiveGoalsToView(null)).toBeNull();
    expect(interactiveGoalsToView({ goals: [] })).toEqual([]);
  });

  it('throws on an unexpected shape', () => {
    expect(() => interactiveGoalsToView({ foo: 1 })).toThrow();
  });
});

describe('plainGoalToView', () => {
  it('converts each goal string', () => {
    const res = { rendered: '```lean\n…\n```', goals: ['hp : p\n⊢ q', '⊢ r'] };
    expect(plainGoalToView(res)).toEqual([
      { kind: 'plain', text: 'hp : p\n⊢ q' },
      { kind: 'plain', text: '⊢ r' },
    ]);
  });

  it('returns null for null', () => {
    expect(plainGoalToView(null)).toBeNull();
  });
});
