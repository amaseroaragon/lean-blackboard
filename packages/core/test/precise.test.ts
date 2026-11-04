import { describe, expect, it } from 'vitest';
import { defaultRules, PreciseProtocolError, preciseGoalsToView, rulesToWire } from '../src';

describe('rulesToWire', () => {
  it('serialises symbols and functions', () => {
    const wire = rulesToWire(defaultRules);
    expect(wire.symbols).toContainEqual({ name: 'Nat', latex: '\\mathbb{N}' });
    expect(wire.functions).toContainEqual({ name: 'Real.sqrt', arity: 1, template: '\\sqrt{#1}' });
  });
});

describe('preciseGoalsToView', () => {
  it('maps the wire format to the view model', () => {
    const res = {
      version: 3,
      goals: [
        {
          userName: 'succ',
          goalPrefix: '⊢ ',
          hyps: [{ names: ['h₁'], type: 'p → q', typeLatex: 'p \\Rightarrow q', isInserted: true }],
          type: 'q',
          typeLatex: 'q',
        },
      ],
    };
    expect(preciseGoalsToView(res, defaultRules).goals).toEqual([
      {
        kind: 'structured',
        userName: 'succ',
        prefix: '⊢ ',
        hyps: [
          {
            names: ['h₁'],
            namesLatex: 'h_{1}',
            type: 'p → q',
            typeLatex: 'p \\Rightarrow q',
            isInserted: true,
            isRemoved: false,
          },
        ],
        type: 'q',
        typeLatex: 'q',
        isInserted: false,
        isRemoved: false,
      },
    ]);
  });

  it('rejects other protocol versions', () => {
    expect(() => preciseGoalsToView({ version: 1, goals: [] }, defaultRules)).toThrow(PreciseProtocolError);
  });

  it('keeps the subterm table for hovers', () => {
    const sub = { latex: 'x', expr: 'x', typeLatex: '\\mathbb{R}', type: 'ℝ' };
    expect(preciseGoalsToView({ version: 3, goals: [], subexprs: [sub] }, defaultRules).subexprs).toEqual([sub]);
  });

  it('passes null through', () => {
    expect(preciseGoalsToView(null, defaultRules)).toEqual({ goals: null });
  });

  it('keeps the expected type; only-expected-type means no tactic state', () => {
    const termGoal = { goalPrefix: '⊢ ', hyps: [], type: 'Nat', typeLatex: '\\mathbb{N}' };
    const v = preciseGoalsToView({ version: 3, goals: [], termGoal }, defaultRules);
    expect(v.goals).toBeNull();
    expect(v.termGoal).toMatchObject({ kind: 'structured', typeLatex: '\\mathbb{N}' });
    const both = preciseGoalsToView({ version: 3, goals: [termGoal], termGoal }, defaultRules);
    expect(both.goals).toHaveLength(1);
  });
});
