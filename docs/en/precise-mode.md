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

With Mathlib, also: `deriv (fun x => …) x` as d/dx, integrals `∫_a^b … dx`, limits
`Tendsto f atTop (nhds l)` as lim, `∃!`, set-builder notation `{x ∈ ℝ | …}` and set inclusion
(Mathlib elaborates `s ⊆ t` as `s ≤ t`; precise mode turns it back into ⊆ using the type).

Custom `functions` and `symbols` rules (`leanBlackboard.customRules`) apply in both modes; operator
rules (`infix`, `prefix`…) only in fast mode. Macros always apply.

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

The package is tested with `leanprover/lean4:v4.34.1` (and Mathlib `v4.34.1`). Lake builds it with
your project's toolchain, so it may not compile with other Lean versions; fast mode remains
available in that case.

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
