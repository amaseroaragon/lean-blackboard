import Lean
import LeanBlackboard.Latex
import LeanBlackboard.DefaultRules
import LeanBlackboard.Definition

/-!
`#latex t`: elaborates `t` and prints its LaTeX. Handy to try rules, and used by the tests.
`#latex_def f`: prints the signature and equations of the definition `f`, as the panel shows them.
-/

namespace LeanBlackboard

open Lean Elab Command Term Meta

/-- Prints the LaTeX for a term, as the precise mode renders it with the default rules. -/
elab "#latex " t:term : command => runTermElabM fun _ => do
  let e ← elabTerm t none
  synthesizeSyntheticMVarsNoPostponing
  let e ← instantiateMVars e
  logInfo m!"{← exprToLatex e defaultRules}"

/-- Prints a definition's signature and equations (one per line), with the default rules. -/
elab "#latex_def " id:ident : command => runTermElabM fun _ => do
  let c ← realizeGlobalConstNoOverloadWithInfo id
  let d ← definitionToLatex c fun e _ => exprToLatex e defaultRules
  let lines := s!"{d.nameLatex} : {d.typeLatex}" :: d.equations.toList.map (·.latex)
  logInfo m!"{"\n".intercalate lines}"

end LeanBlackboard
