import LeanBlackboard

-- Precise mode: this file imports the companion package.
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


theorem div_floor (n m : Nat) (_h : 0 < m) : n / m * m ≤ n := by
  exact Nat.div_mul_le_self n m

theorem bounded (l : List Nat) (h : ∀ x ∈ l, x ≤ 10) : ∀ x ∈ l, x < 11 := by
  intro x hx
  have := h x hx
  omega

-- Term mode: put the cursor on `h` or `Nat.lt_of_lt_of_le` to see the expected type.
theorem term_mode (n : Nat) (h : n < 5) : n < 10 :=
  Nat.lt_of_lt_of_le h (by decide)

-- Before/after: put the cursor at the end of the `rw` line.
theorem rw_demo (a b c : Nat) (h : a * b = c) : b * a = c := by
  rw [Nat.mul_comm]
  exact h

-- Definitions: put the cursor anywhere in a `def` to see its signature and equations.
def square (x : Nat) : Nat := x ^ 2 + 1

def factorial : Nat → Nat
  | 0 => 1
  | n + 1 => (n + 1) * factorial n

-- Structures show their fields; inductive types, their constructors.
structure Interval where
  lo : Int
  hi : Int
  valid : lo ≤ hi

inductive Tree where
  | leaf : Tree
  | node : Tree → Nat → Tree → Tree
