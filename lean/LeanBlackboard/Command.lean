import Lean
import LeanBlackboard.Latex
import LeanBlackboard.DefaultRules

/-!
`#latex t`: elaborates `t` and prints its LaTeX. Handy to try rules, and used by the tests.
-/

namespace LeanBlackboard

open Lean Elab Command Term Meta

/-- Prints the LaTeX for a term, as the precise mode renders it with the default rules. -/
elab "#latex " t:term : command => runTermElabM fun _ => do
  let e ← elabTerm t none
  synthesizeSyntheticMVarsNoPostponing
  let e ← instantiateMVars e
  logInfo m!"{← exprToLatex e defaultRules}"

end LeanBlackboard
