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

  it('maps the position in a simp lemma list', () => {
    const g = { goalPrefix: '⊢ ', hyps: [], type: 'q', typeLatex: 'q' };
    const res = { version: PRECISE_PROTOCOL_VERSION, goals: [g], goalsBefore: [g], simpStep: { applied: 1, total: 2 } };
    expect(preciseGoalsToView(res, defaultRules).simpStep).toEqual({ applied: 1, total: 2 });
    expect(preciseGoalsToView({ ...res, simpStep: null }, defaultRules).simpStep).toBeUndefined();
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
    expect(v.definitions?.[0]).toMatchObject({ kind: 'def', members: [] });
    const none = preciseGoalsToView({ version: PRECISE_PROTOCOL_VERSION, goals: [], definitions: [] }, defaultRules);
    expect(none.goals).toEqual([]);
    expect(none.definitions).toBeUndefined();
  });

  it('exports definitions as LaTeX arrays', () => {
    const doc = definitionsToLatexDocument([
      { kind: 'def', members: [], name: 'seven', nameLatex: '\\mathrm{seven}', type: 'Nat', typeLatex: '\\mathbb{N}', equations: [{ lean: 'seven = 7', latex: '\\htmlData{lbid=0}{\\mathrm{seven}} = 7' }] },
    ]);
    expect(doc).toBe('% Definition seven\n\\[\n\\begin{array}{l}\n\\mathrm{seven} : \\mathbb{N} \\\\\n\\mathrm{seven} = 7\n\\end{array}\n\\]\n');
  });

  it('reads structure fields and inductive constructors', () => {
    const point = {
      kind: 'structure',
      name: 'Point',
      nameLatex: '\\mathrm{Point}',
      type: 'Type',
      typeLatex: '\\mathrm{Type}',
      members: [{ name: 'x', nameLatex: 'x', type: 'Int', typeLatex: '\\mathbb{Z}' }, { name: 'bad' }],
    };
    const v = preciseGoalsToView({ version: PRECISE_PROTOCOL_VERSION, goals: [], definitions: [point] }, defaultRules);
    expect(v.definitions?.[0]).toMatchObject({ kind: 'structure', equations: [], members: [point.members[0]] });
    expect(definitionsToLatexDocument(v.definitions ?? [])).toContain('% Structure Point');
    expect(definitionsToLatexDocument(v.definitions ?? [])).toContain('x : \\mathbb{Z}');
  });
});
