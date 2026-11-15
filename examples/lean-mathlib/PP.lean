import Mathlib
open Real Finset
variable (a x y δ ε : ℝ) (f : ℝ → ℝ) (n k : ℕ) (s t u : Set ℝ) (S : Finset ℕ) (z : ℂ) (q : ℚ) (v w : EuclideanSpace ℝ (Fin 2)) (g : ℕ → ℝ)
#check ∀ ε > 0, ∃ δ > 0, ∀ x, |x - a| < δ → |f x - f a| < ε
#check ∑ i ∈ range n, i = n * (n - 1) / 2
#check ∑ i ∈ range (n + 1), (i : ℝ) ^ 2
#check ∏ i ∈ S, g i
#check √2 * √2 = 2
#check Real.sqrt (x ^ 2) = |x|
#check x⁻¹ * x = 1
#check (n + 1).factorial = (n + 1) * n.factorial
#check ‖v + w‖ ≤ ‖v‖ + ‖w‖
#check ⌊x⌋ ≤ x
#check s ⊆ t ∪ u
#check s ∩ t = ∅
#check {x : ℝ | x > 0} = Set.Ioi 0
#check x ∈ Set.Icc (0 : ℝ) 1
#check ∀ x ∈ Set.Icc (0:ℝ) 1, f x ≤ 1
#check Real.exp (Real.log x) = x
#check Real.sin x ^ 2 + Real.cos x ^ 2 = 1
#check Nat.gcd n k ∣ n
#check ℕ → ℝ
#check (fun x : ℝ => x ^ 2) = fun x => x * x
#check S.card = 3
#check (2 : ℝ) / 3 < 1
#check π / 2 < 2
#check ∫ x in (0:ℝ)..1, x ^ 2 = 1 / 3
#check Nat.choose n 2 = n * (n - 1) / 2
#check deriv (fun x => x ^ 2) x = 2 * x
#check Filter.Tendsto g Filter.atTop (nhds 0)
#check Continuous f
#check z.re ^ 2 + z.im ^ 2 = ‖z‖ ^ 2
#check (q : ℝ) = x
#check Even n ∨ Odd n
#check n.Prime → 2 ≤ n
#check Real.logb 2 8 = 3
#check ‖z‖ = 1
#check ∃! x : ℝ, x ^ 3 = 2
#check Set.univ \ s = sᶜ
#check Function.Injective f
#check ∑ i : Fin n, g i
#check 0 < x⁻¹ ^ 2
#check |(|a| - |y|)| ≤ |a - y|
#check deriv (f + f) x = deriv f x + deriv f x
