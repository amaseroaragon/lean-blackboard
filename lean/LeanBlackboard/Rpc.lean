import Lean
import LeanBlackboard.Latex
import LeanBlackboard.Command

/-!
# RPC method `LeanBlackboard.getGoalsLatex`

Same goals as `Lean.Widget.getInteractiveGoals` (it is built on top of it, so hypotheses, bundling,
case names and diff markers match the infoview), plus LaTeX rendered from the real `Expr`s.

The response has no RPC references, so the client has nothing to release.
-/

namespace LeanBlackboard

open Lean Server Widget Meta

/-- Bumped on incompatible changes to params or response. -/
def protocolVersion : Nat := 1

structure GoalsLatexParams where
  textDocument : Lsp.TextDocumentIdentifier
  position : Lsp.Position
  rules : Rules := {}
  deriving FromJson, ToJson

structure HypLatex where
  names : Array String
  /-- Lean syntax (as in the infoview). -/
  type : String
  typeLatex : String
  val? : Option String := none
  valLatex? : Option String := none
  isInserted? : Option Bool := none
  isRemoved? : Option Bool := none
  deriving FromJson, ToJson

structure GoalLatex where
  userName? : Option String := none
  goalPrefix : String
  hyps : Array HypLatex
  type : String
  typeLatex : String
  isInserted? : Option Bool := none
  isRemoved? : Option Bool := none
  deriving FromJson, ToJson

structure GoalsLatex where
  version : Nat := protocolVersion
  goals : Array GoalLatex
  deriving FromJson, ToJson

/-- LaTeX for an expression, or the Lean text in `\texttt` if anything goes wrong. -/
private def safeLatex (rules : Rules) (e : Expr) (leanText : String) : MetaM String := do
  try exprToLatex e rules catch _ => return texttt leanText

private def goalToLatex (rules : Rules) (g : InteractiveGoal) : IO GoalLatex :=
  g.ctx.val.runMetaM {} do
    let decl ← g.mvarId.getDecl
    withLCtx decl.lctx decl.localInstances do
      let hyps ← g.hyps.mapM fun h => do
        let typeText := h.type.stripTags
        let valText := h.val?.map (·.stripTags)
        let (typeLatex, valLatex?) ← match h.fvarIds[0]? with
          | some fv =>
            match decl.lctx.find? fv with
            | some ldecl =>
              let t ← safeLatex rules ldecl.type typeText
              let v ← match ldecl.value?, valText with
                | some v, some vt => some <$> safeLatex rules v vt
                | _, _ => pure none
              pure (t, v)
            | none => pure (texttt typeText, valText.map texttt)
          | none => pure (texttt typeText, valText.map texttt)
        return {
          names := h.names, type := typeText, typeLatex, val? := valText, valLatex?,
          isInserted? := h.isInserted?, isRemoved? := h.isRemoved? : HypLatex }
      let typeText := g.type.stripTags
      let typeLatex ← safeLatex rules (← g.mvarId.getType) typeText
      return {
        userName? := g.userName?, goalPrefix := g.goalPrefix, hyps, type := typeText, typeLatex,
        isInserted? := g.isInserted?, isRemoved? := g.isRemoved? : GoalLatex }

/-- Goals at a position with LaTeX rendered from the actual expressions. -/
@[server_rpc_method]
def getGoalsLatex (p : GoalsLatexParams) : RequestM (RequestTask (Option GoalsLatex)) := do
  let t ← FileWorker.getInteractiveGoals { textDocument := p.textDocument, position := p.position }
  RequestM.mapTaskCostly t fun
    | .error e => throw e
    | .ok none => return none
    | .ok (some gs) => return some { goals := ← gs.goals.mapM fun g => (goalToLatex p.rules g : IO _) }

end LeanBlackboard
