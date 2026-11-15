# Precise mode

**English** · [Español](../es/modo-preciso.md)

Fast mode converts the **text** Lean prints, so it does not know the types. Precise mode uses the
companion Lean package `LeanBlackboard` (in `lean/`), which walks the actual `Expr` inside the Lean
server and returns LaTeX. What changes:

| Lean | Fast mode | Precise mode |
|---|---|---|
| `p → q` (propositions) | p → q | p ⇒ q |
| `ℕ → ℕ` (types) | ℕ → ℕ | ℕ → ℕ |
| `n / m` in `ℕ` | n/m (fraction) | ⌊n/m⌋ |
| `a / b` in `ℤ` | a/b (fraction) | a div b |
| `∀ x, x ∈ l → p x` | ∀ x ∈ ℕ, x ∈ l → … | ∀ x ∈ l, … |
| `∃ m, n < m` | ∃ m, n < m | ∃ m ∈ ℕ, n < m |
| `if c then a else b` | `\texttt{}` | `cases` |
| `↑n` | n | n |

Also, only in precise mode: hovering over a subexpression shows its type, and Ctrl/Cmd+click opens
its definition (Lean core, Mathlib or your own project).

Constants are named as Lean prints them where the cursor is: `fact` inside `namespace Foo` (or
after `open Foo`), not `Foo.fact`.

With Mathlib, also: `deriv (fun x => …) x` as d/dx, integrals `∫_a^b … dx`, limits
`Tendsto f atTop (nhds l)` as lim, `∃!`, set-builder notation `{x ∈ ℝ | …}` and set inclusion
(Mathlib elaborates `s ⊆ t` as `s ≤ t`; precise mode turns it back into ⊆ using the type).

Custom `functions` and `symbols` rules (`leanBlackboard.customRules`) apply in both modes; operator
rules (`infix`, `prefix`…) only in fast mode. Macros always apply.

## Definitions

With the cursor anywhere in a `def` or `abbrev` (or a `structure` or `inductive`), the panel shows a **Definition** section: the
signature and the defining equations, as on a blackboard. Pattern matching gives one equation per
case, and recursive definitions read as their recursion (Lean's own equation lemmas `f.eq_1`, …),
not as the compiled term:

```lean
def factorial : ℕ → ℕ
  | 0 => 1
  | n + 1 => (n + 1) * factorial n
```

shows *factorial : ℕ → ℕ*, *factorial(0) = 1* and *factorial(n + 1) = (n + 1) · factorial(n)*.
Overlapping patterns (`| _ => …`) add the condition Lean proves for them (*… if x ≠ 0*). Each row
has the Math/Lean toggle and a Copy button; the section's Copy button and `Copy Goal State` export
it as LaTeX.

A `structure` shows its fields (*lo : ℤ*, *hi : ℤ*, *valid : lo ≤ hi*) and an `inductive` type its
constructors (*leaf : Tree*, *node : Tree → ℕ → Tree → Tree*). Instances, the functions Lean
generates (projections, recursors…) and theorems are not shown.

Fast mode shows the section too, with less precision: the type comes from Lean, but the equations,
fields and constructors are read from the source text, so it handles the usual shapes (`:= body`,
`| pattern => …` cases, `match` on parameters, `name : type` fields) and gives no side conditions.
Tactic bodies (`:= by …`) have no equations.

## Steps inside `simp`

`simp only [a, b]` is a single tactic: Lean keeps no proof state between `a` and `b`. With the
cursor inside the brackets, precise mode computes one by running the tactic again, from the state
before it, with only the lemmas before the cursor:

```lean
theorem simp_steps (a b : ℕ) (h : b = a) : (a + 0) * 1 = b := by
  simp only [Nat.add_zero, Nat.mul_one, h]
```

| Cursor | *Before* | Current state |
|---|---|---|
| in `Nat.add_zero` (or just after its comma) | (a + 0) · 1 = b | a · 1 = b |
| in `Nat.mul_one` | a · 1 = b | a = b |
| in `h` | a = b | no goals |
| outside the brackets | start of the line | after the whole `simp` |

A lemma counts as applied once the cursor is past its first character; right after `[` the panel
shows the state before the tactic. A note above the goals says how many lemmas are applied
(*Lemma list: first 1 of 3 applied*).

It works with `simp`, `simp?`, `simp_all`, `dsimp`, `simpa`, `simp … at h` and, with Mathlib,
`simp_rw`, `field_simp`, `norm_num [...]` and `push_cast [...]`. Three things to keep in mind:

- It is what each lemma **adds**, not a trace of what `simp` did. `simp` uses all its lemmas at
  once, so the full list may rewrite a term differently than a prefix of it does. (`simp_rw`
  rewrites with its rules in order, so there the states are the real intermediate ones.)
- A lemma that makes no progress on its own leaves the state as it was, and *Before* is hidden.
- `simpa … using e` has to close the goal, which a prefix of its list does not: its steps show
  what `simp` with the same lemmas does to the goal.

`rw [a, b]` needs none of this: Lean itself records the state after each rule, and the panel shows
it as the InfoView does. Fast mode cannot run tactics, so it always shows the states around the line.

## Enabling it in a project

1. Add the dependency to the project's `lakefile.toml`, from GitHub:

   ```toml
   [[require]]
   name = "LeanBlackboard"
   git = "https://github.com/amaseroaragon/lean-blackboard"
   rev = "main"
   subDir = "lean"
   ```

   With `lakefile.lean`:
   `require LeanBlackboard from git "https://github.com/amaseroaragon/lean-blackboard" @ "main" / "lean"`.

   Or from a local copy of the repository:

   ```toml
   [[require]]
   name = "LeanBlackboard"
   path = "/path/to/lean-blackboard/lean"
   ```

   With `lakefile.lean`: `require LeanBlackboard from "/path/to/lean-blackboard/lean"`.

2. `lake update LeanBlackboard && lake build`.
3. Add `import LeanBlackboard` to the files where you want precise mode. The RPC method only exists
   in files that import it (directly or indirectly).
4. Restart the file in VS Code (`Lean 4: Restart File`) if it was already open.

The package is tested with `leanprover/lean4:v4.34.1` (and Mathlib `v4.34.1`); it also compiles,
and its printer tests pass, with `v4.35.0`. Lake builds it with your project's toolchain, so it may
not compile with other Lean versions; fast mode remains available in that case.

The package and the extension must speak the same protocol version. If one of them is older, the
panel stays in fast mode and says so above the goals: update the package
(`lake update LeanBlackboard`) or the extension.

The panel shows a `precise` or `fast` label next to the position. If the package is not imported,
the extension falls back to fast mode on its own and tries again when the file is saved or after
30 s.

If the project's `lake-manifest.json` does not include the `LeanBlackboard` package (or does not
exist), the extension does not call its RPC methods at all. For an unknown user RPC method, Lean
scans every snapshot of the file before answering "method not found", and while the file is being
elaborated that scan logs `` `Task.get` called from a `(sync := true)` task `` to the server log (a
Lean core issue: `AsyncList.waitFind?` evaluates the lookup in `sync` continuations). The manifest
is read again when it changes, so `lake update` is enough.

To force fast mode: `"leanBlackboard.mode": "fast"`.

## Trying the printer without VS Code

With `import LeanBlackboard`, the `#latex t` command shows the LaTeX precise mode would produce:

```lean
#latex ∀ (p q : Prop), p → q → p
-- \forall p, q : \mathrm{Prop},\ p \Rightarrow q \Rightarrow p
```

And `#latex_def f` shows the signature and equations of the definition `f` (or the fields or
constructors of a type), one per line.
