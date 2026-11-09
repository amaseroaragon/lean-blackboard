import { describe, expect, it } from 'vitest';
import { defaultRules, findSourceDeclaration, sourceDeclarationToView } from '../src';
import type { GoalView } from '../src';

const src = (text: string) => {
  const lines = text.split('\n');
  return { lineCount: lines.length, lineAt: (i: number) => lines[i] ?? '' };
};

/** The declaration around the line containing `needle`. */
function at(text: string, needle: string) {
  const line = text.split('\n').findIndex((l) => l.includes(needle));
  return findSourceDeclaration(src(text), line);
}

const FILE = `import Mathlib

/-- Squares plus one. -/
def sq (x : Nat) : Nat := x ^ 2 + 1

theorem foo : 1 = 1 := by
  rfl

@[simp] def fact : Nat → Nat
  | 0 => 1
  | n + 1 => (n + 1) * fact n  -- recursive

noncomputable def g {α : Type} [Add α] (a b : α) : α :=
  a + b
termination_by 0

def isZero : Nat → Bool
  | 0 => true
  | _ => false

def pick (b : Bool) (n : Nat) : Nat :=
  match b with
  | true => n
  | false => 0

def tac (n : Nat) : Nat := by
  exact n

def S (n : ℕ) : ℕ := ∑ i ∈ Finset.range (n + 1), i ^ 2

structure Interval where
  lo : Int
  hi : Int
  valid : lo ≤ hi
  deriving Repr

structure Pair (α : Type) where
  mk ::
  (fst snd : α)

inductive Tree where
  | leaf : Tree
  | node : Tree → Nat → Tree → Tree

inductive Color
  | red
  | green

inductive Even : Nat → Prop where
  | zero : Even 0
  | step (n : Nat) : Even n → Even (n + 2)
`;

describe('findSourceDeclaration', () => {
  it('reads a definition with a body', () => {
    expect(at(FILE, 'def sq')).toMatchObject({
      kind: 'def',
      name: 'sq',
      nameLine: 3,
      nameCharacter: 4,
      header: '(x : Nat) : Nat',
      equations: ['sq x = x ^ 2 + 1'],
    });
  });

  it('reads pattern-matching cases (attributes, comments)', () => {
    const d = at(FILE, '| n + 1 =>');
    expect(d).toMatchObject({ name: 'fact', nameCharacter: 12 });
    expect(d?.equations).toEqual(['fact 0 = 1', 'fact (n + 1) = (n + 1) * fact n']);
  });

  it('keeps only explicit parameters and drops trailing clauses', () => {
    expect(at(FILE, '  a + b')?.equations).toEqual(['g a b = a + b']);
  });

  it('reads wildcards as a variable', () => {
    expect(at(FILE, 'def isZero')?.equations).toEqual(['isZero 0 = true', 'isZero x = false']);
  });

  it('splits a match on parameters into equations', () => {
    expect(at(FILE, '| true => n')?.equations).toEqual(['pick true n = n', 'pick false n = 0']);
  });

  it('has no equations for tactic bodies', () => {
    expect(at(FILE, 'exact n')).toMatchObject({ name: 'tac', equations: [] });
  });

  it('is undefined outside definitions', () => {
    expect(at(FILE, 'rfl')).toBeUndefined();
    expect(at(FILE, 'import Mathlib')).toBeUndefined();
  });

  it('reads structure fields', () => {
    expect(at(FILE, 'valid : lo')).toMatchObject({
      kind: 'structure',
      name: 'Interval',
      members: [
        { name: 'lo', type: 'Int' },
        { name: 'hi', type: 'Int' },
        { name: 'valid', type: 'lo ≤ hi' },
      ],
    });
    expect(at(FILE, '(fst snd : α)')?.members).toEqual([
      { name: 'fst', type: 'α' },
      { name: 'snd', type: 'α' },
    ]);
  });

  it('reads constructors', () => {
    expect(at(FILE, '| node')?.members).toEqual([
      { name: 'leaf', type: 'Tree' },
      { name: 'node', type: 'Tree → Nat → Tree → Tree' },
    ]);
    expect(at(FILE, '| red')?.members).toEqual([
      { name: 'red', type: 'Color' },
      { name: 'green', type: 'Color' },
    ]);
    expect(at(FILE, '| step')?.members?.[1]).toEqual({ name: 'step', type: '∀ (n : Nat), Even n → Even (n + 2)' });
  });
});

describe('sourceDeclarationToView', () => {
  it('converts equations; the signature comes from Lean when available', () => {
    const d = at(FILE, 'def S');
    if (!d) throw new Error('not found');
    const sig: GoalView = {
      kind: 'structured',
      prefix: '⊢ ',
      hyps: [],
      type: 'ℕ → ℕ',
      typeLatex: '\\mathbb{N} \\to \\mathbb{N}',
      isInserted: false,
      isRemoved: false,
    };
    const v = sourceDeclarationToView(d, sig, defaultRules);
    expect(v).toMatchObject({ kind: 'def', name: 'S', type: 'ℕ → ℕ', typeLatex: '\\mathbb{N} \\to \\mathbb{N}' });
    expect(v.equations[0]?.latex).toBe('S\\left(n\\right) = \\sum_{i=0}^{n} i^{2}');
    const noSig = sourceDeclarationToView(d, undefined, defaultRules);
    expect(noSig).toMatchObject({ type: '(n : ℕ) : ℕ', typeLatex: '\\texttt{(n : ℕ) : ℕ}' });
  });

  it('converts members', () => {
    const d = at(FILE, '| step');
    if (!d) throw new Error('not found');
    const v = sourceDeclarationToView(d, undefined, defaultRules);
    expect(v.members[0]).toMatchObject({ name: 'zero', typeLatex: '\\operatorname{Even}\\left(0\\right)' });
  });
});
