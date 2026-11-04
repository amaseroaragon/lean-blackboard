import Lean
import LeanBlackboard.Latex

/-!
`#latex t`: elaborates `t` and prints its LaTeX. Handy to try rules, and used by the tests.
-/

namespace LeanBlackboard

open Lean Elab Command Term Meta

/-- Prints the LaTeX for a term (as the precise mode would render it). -/
elab "#latex " t:term : command => runTermElabM fun _ => do
  let e ← elabTerm t none
  synthesizeSyntheticMVarsNoPostponing
  let e ← instantiateMVars e
  logInfo m!"{← exprToLatex e}"

end LeanBlackboard
