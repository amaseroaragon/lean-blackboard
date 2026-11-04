import Mathlib
import LeanBlackboard

/-! Mathlib examples for trying the panel by hand (precise mode: imports `LeanBlackboard`).
Proofs are `sorry` where the point is just to look at the goal. -/

open Real Finset

theorem gauss_sum (n : ℕ) : ∑ i ∈ range (n + 1), i = n * (n + 1) / 2 := by
  induction n with
  | zero => simp
  | succ k ih => sorry

theorem continuity (f : ℝ → ℝ) (a : ℝ) (hf : ContinuousAt f a) :
    ∀ ε > 0, ∃ δ > 0, ∀ x, |x - a| < δ → |f x - f a| < ε := by
  intro ε hε
  sorry

theorem pythagoras (x : ℝ) : sin x ^ 2 + cos x ^ 2 = 1 := by
  exact sin_sq_add_cos_sq x

theorem interval (f : ℝ → ℝ) (h : ∀ x ∈ Set.Icc (0 : ℝ) 1, f x ≤ 1) : f (1 / 2) ≤ 1 := by
  apply h
  constructor <;> norm_num

theorem integral_sq : ∫ x in (0 : ℝ)..1, x ^ 2 = 1 / 3 := by
  sorry

theorem deriv_sq (x : ℝ) : deriv (fun x => x ^ 2) x = 2 * x := by
  sorry

theorem limit_inv : Filter.Tendsto (fun n : ℕ => (1 : ℝ) / n) Filter.atTop (nhds 0) := by
  sorry

theorem sets (s t : Set ℝ) (h : s ⊆ t) : s ∩ t = s := by
  exact Set.inter_eq_left.mpr h

theorem choose_two (n : ℕ) : n.choose 2 = n * (n - 1) / 2 := by
  exact Nat.choose_two_right n
