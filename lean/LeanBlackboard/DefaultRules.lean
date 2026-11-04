import Lean
import LeanBlackboard.Latex

/-!
Default `symbols`/`functions` rules, generated from the extension's TypeScript `defaultRules`
(`npm run export-rules` writes `defaultRules.json`). The extension sends its own (possibly
user-extended) copy with each request; this copy is for `#latex` and the tests.
-/

namespace LeanBlackboard

open Lean

/-- The default rules shared with the extension. Empty if the JSON cannot be parsed. -/
def defaultRules : Rules :=
  match Json.parse (include_str "defaultRules.json") >>= fromJson? with
  | .ok r => r
  | .error _ => {}

end LeanBlackboard
