-- Fast mode: no `import LeanBlackboard`, so the extension converts the text itself.

theorem fast_imp (p q r : Prop) : (p → q) → (q → r) → p → r := by
  intro hpq hqr hp
  exact hqr (hpq hp)

theorem fast_div (n m : Nat) (_h : 0 < m) : n / m * m ≤ n := by
  exact Nat.div_mul_le_self n m

-- Term mode in fast mode.
theorem fast_term (n : Nat) (h : n < 5) : n < 10 :=
  Nat.lt_of_lt_of_le h (by decide)

-- Definitions in fast mode: equations read from the source, type from Lean.
def double : Nat → Nat
  | 0 => 0
  | n + 1 => double n + 2
