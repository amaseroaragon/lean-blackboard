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
      version: 1,
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
    expect(preciseGoalsToView(res, defaultRules)).toEqual([
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
    expect(() => preciseGoalsToView({ version: 2, goals: [] }, defaultRules)).toThrow(PreciseProtocolError);
  });

  it('passes null through', () => {
    expect(preciseGoalsToView(null, defaultRules)).toBeNull();
  });
});
