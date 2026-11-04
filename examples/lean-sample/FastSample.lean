-- Fast mode: no `import LeanBlackboard`, so the extension converts the text itself.

theorem fast_imp (p q r : Prop) : (p → q) → (q → r) → p → r := by
  intro hpq hqr hp
  exact hqr (hpq hp)

theorem fast_div (n m : Nat) (_h : 0 < m) : n / m * m ≤ n := by
  exact Nat.div_mul_le_self n m
