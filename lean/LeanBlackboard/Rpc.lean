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
def protocolVersion : Nat := 3

structure GoalsLatexParams where
  textDocument : Lsp.TextDocumentIdentifier
  position : Lsp.Position
  rules : Rules := {}
  /-- Mark subterms with `\htmlData{lbid=N}{…}` and return `subexprs` (hover, go-to-definition). -/
  interactive : Bool := false
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
  /-- Tactic goals; empty array if there are none. -/
  goals : Array GoalLatex
  /-- Expected type of the term at the position (term mode), as in the infoview. -/
  termGoal? : Option GoalLatex := none
  /-- Data for marked subterms, indexed by the `lbid` in the LaTeX (empty if not interactive). -/
  subexprs : Array SubexprData := #[]
  deriving FromJson, ToJson

/-- Rendering options for one response; `state` accumulates the subterms of all its goals. -/
private structure Renderer where
  rules : Rules
  interactive : Bool
  state : IO.Ref LatexState

/-- LaTeX for an expression, or the Lean text in `\texttt` if anything goes wrong. -/
private def safeLatex (r : Renderer) (e : Expr) (leanText : String) : MetaM String := do
  try
    if r.interactive then
      let (s, st) ← (exprToLatexMarked e r.rules).run (← r.state.get)
      r.state.set st
      return s
    exprToLatex e r.rules
  catch _ => return texttt leanText

/-- Hypotheses of a goal, rendered from the local declarations in `lctx`. -/
private def hypsToLatex (r : Renderer) (lctx : LocalContext)
    (hyps : Array InteractiveHypothesisBundle) : MetaM (Array HypLatex) :=
      hyps.mapM fun h => do
        let typeText := h.type.stripTags
        let valText := h.val?.map (·.stripTags)
        let (typeLatex, valLatex?) ← match h.fvarIds[0]? with
          | some fv =>
            match lctx.find? fv with
            | some ldecl =>
              let t ← safeLatex r ldecl.type typeText
              let v ← match ldecl.value?, valText with
                | some v, some vt => some <$> safeLatex r v vt
                | _, _ => pure none
              pure (t, v)
            | none => pure (texttt typeText, valText.map texttt)
          | none => pure (texttt typeText, valText.map texttt)
        return {
          names := h.names, type := typeText, typeLatex, val? := valText, valLatex?,
          isInserted? := h.isInserted?, isRemoved? := h.isRemoved? : HypLatex }

private def goalToLatex (r : Renderer) (g : InteractiveGoal) : IO GoalLatex :=
  g.ctx.val.runMetaM {} do
    let decl ← g.mvarId.getDecl
    withLCtx decl.lctx decl.localInstances do
      let hyps ← hypsToLatex r decl.lctx g.hyps
      let typeText := g.type.stripTags
      let typeLatex ← safeLatex r (← g.mvarId.getType) typeText
      return {
        userName? := g.userName?, goalPrefix := g.goalPrefix, hyps, type := typeText, typeLatex,
        isInserted? := g.isInserted?, isRemoved? := g.isRemoved? : GoalLatex }

/-- The expected type of a term (term mode), from its `TermInfo`. -/
private def termGoalToLatex (r : Renderer) (g : InteractiveTermGoal) : IO GoalLatex := do
  let ti := g.term.val
  g.ctx.val.runMetaM ti.lctx do
    let hyps ← hypsToLatex r ti.lctx g.hyps
    let typeText := g.type.stripTags
    let ty ← instantiateMVars (ti.expectedType?.getD (← inferType ti.expr))
    let typeLatex ← safeLatex r ty typeText
    return { goalPrefix := "⊢ ", hyps, type := typeText, typeLatex : GoalLatex }

/--
Goals (tactic mode) and expected type (term mode) at a position, with LaTeX rendered from the
actual expressions. `none` if there is neither.
-/
@[server_rpc_method]
def getGoalsLatex (p : GoalsLatexParams) : RequestM (RequestTask (Option GoalsLatex)) := do
  let goalsTask ← FileWorker.getInteractiveGoals
    { textDocument := p.textDocument, position := p.position }
  let termTask ← FileWorker.getInteractiveTermGoal
    { textDocument := p.textDocument, position := p.position }
  RequestM.bindTaskCostly goalsTask fun goals? => do
    RequestM.mapTaskCostly termTask fun term? => do
      let goals? ← match goals? with
        | .error e => throw e
        | .ok gs => pure gs
      let term? ← match term? with
        | .error _ => pure none -- the expected type is a bonus: never fail because of it
        | .ok t => pure t
      if goals?.isNone && term?.isNone then return none
      let r : Renderer := {
        rules := p.rules, interactive := p.interactive,
        state := ← IO.mkRef { currentUri := p.textDocument.uri } }
      let goals ← match goals? with
        | some gs => gs.goals.mapM fun g => (goalToLatex r g : IO _)
        | none => pure #[]
      let termGoal? ← match term? with
        | some t => some <$> (termGoalToLatex r t : IO _)
        | none => pure none
      return some { goals, termGoal?, subexprs := (← r.state.get).subexprs }

end LeanBlackboard
