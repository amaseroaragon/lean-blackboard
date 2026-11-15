import LeanBlackboard

/-! Golden tests for the precise-mode printer. Run with `lake build LeanBlackboardTest`. -/

variable (n m k : Nat) (a b c : Int) (p q r : Prop) (l s : List Nat) (f : Nat → Nat)
  (x₁ x' : Nat) (α : Type) (u v : Rat)

-- Type-aware implication: `⇒` between propositions, `→` between types.
/-- info: p \land q \Rightarrow q \land p -/
#guard_msgs in #latex p ∧ q → q ∧ p
/-- info: \left(p \Rightarrow q\right) \Rightarrow \left(q \Rightarrow r\right) \Rightarrow p \Rightarrow r -/
#guard_msgs in #latex (p → q) → (q → r) → p → r
/-- info: \mathbb{N} \to \mathbb{N} -/
#guard_msgs in #latex Nat → Nat
/-- info: \alpha \times \mathbb{N} \to \mathrm{Prop} -/
#guard_msgs in #latex α × Nat → Prop

-- Type-aware division.
/-- info: \left\lfloor \frac{n}{m} \right\rfloor = k -/
#guard_msgs in #latex n / m = k
/-- info: a \mathbin{\operatorname{div}} b = c -/
#guard_msgs in #latex a / b = c
/-- info: \frac{u}{v} = 1 -/
#guard_msgs in #latex u / v = 1

-- Quantifiers: merged binders and bounded forms.
/-- info: \forall n \in \mathbb{N},\ 0 + n = n -/
#guard_msgs in #latex ∀ n : Nat, 0 + n = n
/-- info: \forall x, y \in \mathbb{N},\ x + y = y + x -/
#guard_msgs in #latex ∀ (x y : Nat), x + y = y + x
/-- info: \exists m > 0,\ n < m -/
#guard_msgs in #latex ∃ m > 0, n < m
/-- info: \exists m \in \mathbb{N},\ n < m -/
#guard_msgs in #latex ∃ m, n < m
/-- info: \forall x \in l,\ x \leq 10 -/
#guard_msgs in #latex ∀ x ∈ l, x ≤ 10
/-- info: \forall \beta : \mathrm{Type},\ \operatorname{Nonempty}\left(\beta\right) -/
#guard_msgs in #latex ∀ {β : Type} [Inhabited β], Nonempty β

-- Logic and relations.
/-- info: \neg \left(p \lor q\right) \iff \neg p \land \neg q -/
#guard_msgs in #latex ¬(p ∨ q) ↔ ¬p ∧ ¬q
/-- info: n \neq m -/
#guard_msgs in #latex ¬n = m
/-- info: n \mid m \cdot k -/
#guard_msgs in #latex n ∣ m * k

-- Arithmetic, coercions, application.
/-- info: a^{2} + b^{2} = c^{n + 1} -/
#guard_msgs in #latex a ^ 2 + b ^ 2 = c ^ (n + 1)
/-- info: -a \cdot \left(-b\right) -/
#guard_msgs in #latex -a * -b
/-- info: n + a -/
#guard_msgs in #latex (n : Int) + a
/-- info: 2 \cdot a -/
#guard_msgs in #latex (2 : Int) * a
/-- info: f\left(n + 1\right) = f\left(n\right) + 1 -/
#guard_msgs in #latex f (n + 1) = f n + 1
/-- info: x_{1} + x' = 0 -/
#guard_msgs in #latex x₁ + x' = 0

-- A negative operand is parenthesised after an arithmetic operator, not after a relation.
/-- info: a = -1 -/
#guard_msgs in #latex a = -1
/-- info: a \leq -b \land -b < c -/
#guard_msgs in #latex a ≤ -b ∧ -b < c
/-- info: a - \left(-b\right) = a + b -/
#guard_msgs in #latex a - -b = a + b
/-- info: -\left(-a\right) = a -/
#guard_msgs in #latex - -a = a

-- Literals and structures Lean prints with their own notation.
/-- info: u < 2.5 \land 0.05 < u -/
#guard_msgs in #latex u < 2.5 ∧ 0.05 < u
/-- info: \left(n, m, k\right).1 = n -/
#guard_msgs in #latex (n, m, k).1 = n
/-- info: \forall p : \mathbb{N} \times \mathbb{N},\ p.1 + p.2 = p.2 + p.1 -/
#guard_msgs in #latex ∀ p : Nat × Nat, p.1 + p.2 = p.2 + p.1
/-- info: \forall h : n > 0,\ \left\langle n, h\right\rangle  = n -/
#guard_msgs in #latex ∀ h : n > 0, (⟨n, h⟩ : {x : Nat // x > 0}).val = n
/-- info: \forall h : n < \operatorname{List.length}\left(l\right),\ l\left[n\right] = 0 -/
#guard_msgs in #latex ∀ h : n < l.length, l[n] = 0
/-- info: \begin{cases} n & \text{if } n = m \\ m & \text{otherwise} \end{cases} = k -/
#guard_msgs in #latex (if _h : n = m then n else m) = k

-- `sorry` (also the one Lean inserts for a term with errors) is not expanded.
/-- info: n = \mathrm{sorry} -/
#guard_msgs in #latex n = sorryAx Nat false

-- Lists, functions, conditionals.
/-- info: l \mathbin{+\!\!+} \left[1, 2\right] = 0 :: l -/
#guard_msgs in #latex l ++ [1, 2] = 0 :: l
/-- info: x \mapsto x + 1 -/
#guard_msgs in #latex fun (x : Nat) => x + 1
/-- info: \begin{cases} 1 & \text{if } n = 0 \\ 2 & \text{otherwise} \end{cases} -/
#guard_msgs in #latex if n = 0 then 1 else 2

-- Client rules (default + user `functions`/`symbols`) are applied by constant name.
open Lean Meta LeanBlackboard in
/-- info: ("\\left|{l}\\right|", "\\N", "\\operatorname{List.length}\\left(l\\right)") -/
#guard_msgs in
#eval show MetaM (String × String × String) from do
  let rules : Rules := {
    functions := #[{ name := "List.length", arity := 1, template := "\\left|{#1}\\right|" }],
    symbols := #[{ name := "Nat", latex := "\\N" }] }
  withLocalDeclD `l (mkApp (mkConst ``List [0]) (mkConst ``Nat)) fun l => do
    let len ← mkAppM ``List.length #[l]
    return (← exprToLatex len rules, ← exprToLatex (mkConst ``Nat) rules, ← exprToLatex len)

-- Definitions: signature and defining equations (`#latex_def`). Names are shown as Lean prints
-- them here (`fact`, not `DefTests.fact`); hygienic binders (`| _ =>`) get plain names.
namespace DefTests

def sq (x : Nat) : Nat := x ^ 2 + 1
def fact : Nat → Nat
  | 0 => 1
  | n + 1 => (n + 1) * fact n
def isZero : Nat → Bool
  | 0 => true
  | _ => false
def fib : Nat → Nat
  | 0 => 0
  | 1 => 1
  | n + 2 => fib n + fib (n + 1)
def half (n : Nat) : Nat := n / 2
def seven : Nat := 7

/--
info: \mathrm{sq} : \mathbb{N} \to \mathbb{N}
\operatorname{sq}\left(x\right) = x^{2} + 1
-/
#guard_msgs in #latex_def sq
/--
info: \mathrm{fact} : \mathbb{N} \to \mathbb{N}
\operatorname{fact}\left(0\right) = 1
\operatorname{fact}\left(n + 1\right) = \left(n + 1\right) \cdot \operatorname{fact}\left(n\right)
-/
#guard_msgs in #latex_def fact
/--
info: \mathrm{isZero} : \mathbb{N} \to \mathrm{Bool}
\operatorname{isZero}\left(0\right) = \mathtt{true}
\operatorname{isZero}\left(x\right) = \mathtt{false} \quad \text{if } x \neq 0
-/
#guard_msgs in #latex_def isZero
/--
info: \mathrm{half} : \mathbb{N} \to \mathbb{N}
\operatorname{half}\left(n\right) = \left\lfloor \frac{n}{2} \right\rfloor
-/
#guard_msgs in #latex_def half
/--
info: \mathrm{fib} : \mathbb{N} \to \mathbb{N}
\operatorname{fib}\left(0\right) = 0
\operatorname{fib}\left(1\right) = 1
\operatorname{fib}\left(n + 2\right) = \operatorname{fib}\left(n\right) + \operatorname{fib}\left(n + 1\right)
-/
#guard_msgs in #latex_def fib
/--
info: \mathrm{seven} : \mathbb{N}
\mathrm{seven} = 7
-/
#guard_msgs in #latex_def seven

-- Structures show their fields; inductive types, their constructors.
structure Point where
  x : Int
  y : Int
  h : x < y
inductive Tree where
  | leaf : Tree
  | node : Tree → Nat → Tree → Tree
inductive Even : Nat → Prop where
  | zero : Even 0
  | step (n : Nat) : Even n → Even (n + 2)

/--
info: \mathrm{Point} : \mathrm{Type}
x : \mathbb{Z}
y : \mathbb{Z}
h : x < y
-/
#guard_msgs in #latex_def Point
/--
info: \mathrm{Tree} : \mathrm{Type}
\mathrm{leaf} : \mathrm{Tree}
\mathrm{node} : \mathrm{Tree} \to \mathbb{N} \to \mathrm{Tree} \to \mathrm{Tree}
-/
#guard_msgs in #latex_def Tree
/--
info: \mathrm{Even} : \mathbb{N} \to \mathrm{Prop}
\mathrm{zero} : \operatorname{Even}\left(0\right)
\mathrm{step} : \forall n \in \mathbb{N},\ \operatorname{Even}\left(n\right) \Rightarrow \operatorname{Even}\left(n + 2\right)
-/
#guard_msgs in #latex_def Even

end DefTests
