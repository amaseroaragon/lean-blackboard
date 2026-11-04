-- Small theorems to exercise hypotheses and goals in the spike.

theorem and_swap (p q : Prop) (hp : p) (hq : q) : q ∧ p := by
  constructor
  · exact hq
  · exact hp

theorem imp_trans (p q r : Prop) : (p → q) → (q → r) → p → r := by
  intro hpq hqr hp
  apply hqr
  exact hpq hp

theorem zero_add' (n : Nat) : 0 + n = n := by
  induction n with
  | zero => rfl
  | succ k ih => rw [Nat.add_succ, ih]

theorem exists_gt (n : Nat) : ∃ m, n < m := by
  refine ⟨n + 1, ?_⟩
  omega
