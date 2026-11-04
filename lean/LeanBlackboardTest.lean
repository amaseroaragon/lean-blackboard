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
