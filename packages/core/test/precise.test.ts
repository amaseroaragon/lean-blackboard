import { describe, expect, it } from 'vitest';
import { defaultRules, definitionsToLatexDocument, PRECISE_PROTOCOL_VERSION, PreciseProtocolError, preciseGoalsToView, rulesToWire } from '../src';

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
      version: PRECISE_PROTOCOL_VERSION,
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
    expect(() => preciseGoalsToView({ version: 3, goals: [] }, defaultRules)).toThrow(PreciseProtocolError);
  });

  it('keeps the subterm table for hovers', () => {
    const sub = { latex: 'x', expr: 'x', typeLatex: '\\mathbb{R}', type: 'ℝ' };
    expect(preciseGoalsToView({ version: PRECISE_PROTOCOL_VERSION, goals: [], subexprs: [sub] }, defaultRules).subexprs).toEqual([sub]);
  });

  it('maps the goals before the step', () => {
    const g = { goalPrefix: '⊢ ', hyps: [], type: 'q', typeLatex: 'q' };
    const v = preciseGoalsToView({ version: PRECISE_PROTOCOL_VERSION, goals: [g], goalsBefore: [g, g] }, defaultRules);
    expect(v.goalsBefore).toHaveLength(2);
  });

  it('passes null through', () => {
    expect(preciseGoalsToView(null, defaultRules)).toEqual({ goals: null });
  });

  it('keeps the expected type; only-expected-type means no tactic state', () => {
    const termGoal = { goalPrefix: '⊢ ', hyps: [], type: 'Nat', typeLatex: '\\mathbb{N}' };
    const v = preciseGoalsToView({ version: PRECISE_PROTOCOL_VERSION, goals: [], termGoal }, defaultRules);
    expect(v.goals).toBeNull();
    expect(v.termGoal).toMatchObject({ kind: 'structured', typeLatex: '\\mathbb{N}' });
    const both = preciseGoalsToView({ version: PRECISE_PROTOCOL_VERSION, goals: [termGoal], termGoal }, defaultRules);
    expect(both.goals).toHaveLength(1);
  });

  it('keeps definitions; only definitions means no tactic state', () => {
    const def = {
      name: 'fact',
      nameLatex: '\\mathrm{fact}',
      type: 'Nat → Nat',
      typeLatex: '\\mathbb{N} \\to \\mathbb{N}',
      equations: [
        { lean: 'fact 0 = 1', latex: '\\operatorname{fact}\\left(0\\right) = 1' },
        { lean: 'bad' },
      ],
    };
    const v = preciseGoalsToView({ version: PRECISE_PROTOCOL_VERSION, goals: [], definitions: [def, { name: 1 }] }, defaultRules);
    expect(v.goals).toBeNull();
    expect(v.definitions).toHaveLength(1);
    expect(v.definitions?.[0]?.equations).toEqual([def.equations[0]]);
    const none = preciseGoalsToView({ version: PRECISE_PROTOCOL_VERSION, goals: [], definitions: [] }, defaultRules);
    expect(none.goals).toEqual([]);
    expect(none.definitions).toBeUndefined();
  });

  it('exports definitions as LaTeX arrays', () => {
    const doc = definitionsToLatexDocument([
      { name: 'seven', nameLatex: '\\mathrm{seven}', type: 'Nat', typeLatex: '\\mathbb{N}', equations: [{ lean: 'seven = 7', latex: '\\htmlData{lbid=0}{\\mathrm{seven}} = 7' }] },
    ]);
    expect(doc).toBe('% Definition seven\n\\[\n\\begin{array}{l}\n\\mathrm{seven} : \\mathbb{N} \\\\\n\\mathrm{seven} = 7\n\\end{array}\n\\]\n');
  });
});
