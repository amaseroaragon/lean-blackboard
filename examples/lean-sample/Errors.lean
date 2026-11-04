import LeanBlackboard

/-! Intentional errors, to see messages rendered in the panel. Not part of the Lake build. -/

theorem mismatch (n : Nat) (h : n < 5) : n + 1 < 7 := by
  exact h

theorem unsolved (p q : Prop) (hp : p) (hq : q) : p ∧ q → q ∧ p := by
  intro h
