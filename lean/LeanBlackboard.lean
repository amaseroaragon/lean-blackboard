import LeanBlackboard.Latex
import LeanBlackboard.Command
import LeanBlackboard.Rpc

/-!
# LeanBlackboard

Companion package for the Lean Blackboard VS Code extension ("precise mode").
Importing it registers the RPC method `LeanBlackboard.getGoalsLatex`, which renders the goals at
a position as LaTeX from the actual `Expr`s. Without the import, the extension falls back to its
text-based fast mode.
-/
