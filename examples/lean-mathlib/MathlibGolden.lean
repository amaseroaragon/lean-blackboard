import Mathlib
import LeanBlackboard

/-! Golden tests of the precise mode on real Mathlib terms. Run: `lake build MathlibGolden`. -/
open Real Finset Nat
variable (a x y δ ε : ℝ) (f : ℝ → ℝ) (n k : ℕ) (s t u : Set ℝ) (S : Finset ℕ) (z : ℂ) (q : ℚ) (v w : EuclideanSpace ℝ (Fin 2)) (g : ℕ → ℝ)

/-- info: \forall \varepsilon > 0,\ \exists \delta > 0,\ \forall x \in \mathbb{R},\ \left|{x - a}\right| < \delta \Rightarrow \left|{f\left(x\right) - f\left(a\right)}\right| < \varepsilon -/
#guard_msgs in #latex ∀ ε > 0, ∃ δ > 0, ∀ x, |x - a| < δ → |f x - f a| < ε
/-- info: \sum_{i=0}^{n - 1} i = \left\lfloor \frac{n \cdot \left(n - 1\right)}{2} \right\rfloor -/
#guard_msgs in #latex ∑ i ∈ range n, i = n * (n - 1) / 2
/-- info: \sum_{i=0}^{n} i^{2} -/
#guard_msgs in #latex ∑ i ∈ range (n + 1), (i : ℝ) ^ 2
/-- info: \prod_{i \in S} g\left(i\right) -/
#guard_msgs in #latex ∏ i ∈ S, g i
/-- info: \sqrt{2} \cdot \sqrt{2} = 2 -/
#guard_msgs in #latex √2 * √2 = 2
/-- info: \sqrt{x^{2}} = \left|{x}\right| -/
#guard_msgs in #latex Real.sqrt (x ^ 2) = |x|
/-- info: x^{-1} \cdot x = 1 -/
#guard_msgs in #latex x⁻¹ * x = 1
/-- info: \left(n + 1\right)! = \left(n + 1\right) \cdot n! -/
#guard_msgs in #latex (n + 1)! = (n + 1) * n !
/-- info: \left\|{v + w}\right\| \leq \left\|{v}\right\| + \left\|{w}\right\| -/
#guard_msgs in #latex ‖v + w‖ ≤ ‖v‖ + ‖w‖
/-- info: \left\lfloor {x}\right\rfloor \leq x -/
#guard_msgs in #latex (⌊x⌋ : ℝ) ≤ x
/-- info: s \subseteq t \cup u -/
#guard_msgs in #latex s ⊆ t ∪ u
/-- info: s \cap t = \emptyset -/
#guard_msgs in #latex s ∩ t = ∅
/-- info: \left\{ x \in \mathbb{R} \mid x > 0 \right\} = \left({0}, \infty\right) -/
#guard_msgs in #latex {x : ℝ | x > 0} = Set.Ioi 0
/-- info: \forall x \in \left[{0}, {1}\right],\ f\left(x\right) \leq 1 -/
#guard_msgs in #latex ∀ x ∈ Set.Icc (0:ℝ) 1, f x ≤ 1
/-- info: \exp \left(\log x\right) = x -/
#guard_msgs in #latex Real.exp (Real.log x) = x
/-- info: \left(\sin x\right)^{2} + \left(\cos x\right)^{2} = 1 -/
#guard_msgs in #latex Real.sin x ^ 2 + Real.cos x ^ 2 = 1
/-- info: \gcd\left({n}, {k}\right) \mid n -/
#guard_msgs in #latex Nat.gcd n k ∣ n
/-- info: \frac{2}{3} < 1 -/
#guard_msgs in #latex (2 : ℝ) / 3 < 1
/-- info: \frac{\pi}{2} < 2 -/
#guard_msgs in #latex π / 2 < 2
/-- info: \int_{0}^{1} x^{2} \, dx = \frac{1}{3} -/
#guard_msgs in #latex ∫ x in (0:ℝ)..1, x ^ 2 = 1 / 3
/-- info: \int_{s} x^{2} \, dx = 0 -/
#guard_msgs in #latex ∫ x in s, x ^ 2 = 0
/-- info: \binom{n}{2} = \left\lfloor \frac{n \cdot \left(n - 1\right)}{2} \right\rfloor -/
#guard_msgs in #latex Nat.choose n 2 = n * (n - 1) / 2
/-- info: \frac{d}{dx}\left(x^{2}\right) = 2 \cdot x -/
#guard_msgs in #latex deriv (fun x => x ^ 2) x = 2 * x
/-- info: \left.\frac{d}{dx}\left(x^{2}\right)\right|_{x = 3} = 6 -/
#guard_msgs in #latex deriv (fun x : ℝ => x ^ 2) (3 : ℝ) = 6
/-- info: f'\left(x\right) = 0 -/
#guard_msgs in #latex deriv f x = 0
/-- info: \lim_{n \to \infty} g\left(n\right) = 0 -/
#guard_msgs in #latex Filter.Tendsto g Filter.atTop (nhds 0)
/-- info: \lim_{n \to \infty} \frac{1}{n} = 0 -/
#guard_msgs in #latex Filter.Tendsto (fun n : ℕ => (1:ℝ) / n) Filter.atTop (nhds 0)
/-- info: \left(\operatorname{Re} z\right)^{2} + \left(\operatorname{Im} z\right)^{2} = \left\|{z}\right\|^{2} -/
#guard_msgs in #latex z.re ^ 2 + z.im ^ 2 = ‖z‖ ^ 2
/-- info: q = x -/
#guard_msgs in #latex (q : ℝ) = x
/-- info: \operatorname{Even}\left(n\right) \lor \operatorname{Odd}\left(n\right) -/
#guard_msgs in #latex Even n ∨ Odd n
/-- info: \operatorname{Nat.Prime}\left(n\right) \Rightarrow 2 \leq n -/
#guard_msgs in #latex n.Prime → 2 ≤ n
/-- info: \log_{{2}} 8 = 3 -/
#guard_msgs in #latex Real.logb 2 8 = 3
/-- info: \exists! x \in \mathbb{R},\ x^{3} = 2 -/
#guard_msgs in #latex ∃! x : ℝ, x ^ 3 = 2
/-- info: \mathrm{Set.univ} \setminus s = s^{\complement} -/
#guard_msgs in #latex Set.univ \ s = sᶜ
/-- info: \operatorname{Function.Injective}\left(f\right) -/
#guard_msgs in #latex Function.Injective f
/-- info: \left|{S}\right| = 3 -/
#guard_msgs in #latex S.card = 3
/-- info: x \in \left[{0}, {1}\right] -/
#guard_msgs in #latex x ∈ Set.Icc (0 : ℝ) 1

-- Function coercions (`⇑f x`) render as applications; polynomial evaluation and monomials.
section
variable (P : Polynomial ℝ) (g₀ : ℝ →+ ℝ) (L : ℝ →L[ℝ] ℝ) (q : ℕ) (c : ℝ)
/-- info: g_{0}\left(1\right) = g_{0}\left(x\right) + 2 -/
#guard_msgs in #latex g₀ 1 = g₀ x + 2
/-- info: L\left(x + 1\right) = 0 -/
#guard_msgs in #latex L (x + 1) = 0
/-- info: \left(c X^{q + 1}\right)\left({x}\right) = P\left({x}\right) -/
#guard_msgs in #latex Polynomial.eval x ((Polynomial.monomial (q + 1)) c) = Polynomial.eval x P
end
