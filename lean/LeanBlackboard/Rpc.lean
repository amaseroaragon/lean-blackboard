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
def protocolVersion : Nat := 4

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
  /--
  The goals before the tactic at the cursor, when the cursor is after it (so `goals` is the state
  after). Changed subterms are marked `lbdiff=old` here and `lbdiff=new` in `goals`.
  -/
  goalsBefore? : Option (Array GoalLatex) := none
  /-- Data for marked subterms, indexed by the `lbid` in the LaTeX (empty if not interactive). -/
  subexprs : Array SubexprData := #[]
  deriving FromJson, ToJson

/-- Rendering options for one response; `state` accumulates the subterms of all its goals. -/
private structure Renderer where
  rules : Rules
  interactive : Bool
  state : IO.Ref LatexState

abbrev Diff := Option DiffAgainst

/--
The other state's subterms, kept per role: targets are compared with targets, and each
hypothesis with the hypothesis of the same name (otherwise `a * b` in some hypothesis would hide
that it is new in the target).
-/
structure DiffSets where
  target : Std.HashSet Expr := {}
  hyps : Std.HashMap String (Std.HashSet Expr) := {}
  all : Std.HashSet Expr := {}
  kind : String

private def hypKey (n : Name) : String := n.eraseMacroScopes.toString

/-- LaTeX for an expression, or the Lean text in `\texttt` if anything goes wrong. -/
private def safeLatex (r : Renderer) (e : Expr) (leanText : String) (diff? : Diff := none) :
    MetaM String := do
  try
    if r.interactive then
      let (s, st) ← (exprToLatexMarked e r.rules diff?).run (← r.state.get)
      r.state.set st
      return s
    exprToLatex e r.rules
  catch _ => return texttt leanText

/-- Hypotheses of a goal, rendered from the local declarations in `lctx`. -/
private def hypsToLatex (r : Renderer) (lctx : LocalContext)
    (hyps : Array InteractiveHypothesisBundle) (diff? : Option DiffSets := none) :
    MetaM (Array HypLatex) :=
      hyps.mapM fun h => do
        let typeText := h.type.stripTags
        let valText := h.val?.map (·.stripTags)
        let (typeLatex, valLatex?) ← match h.fvarIds[0]? with
          | some fv =>
            match lctx.find? fv with
            | some ldecl =>
              let diff? : Diff := diff?.bind fun d =>
                (d.hyps.get? (hypKey ldecl.userName)).map fun part => { part, all := d.all, kind := d.kind }
              let t ← safeLatex r ldecl.type typeText diff?
              let v ← match ldecl.value?, valText with
                | some v, some vt => some <$> safeLatex r v vt diff?
                | _, _ => pure none
              pure (t, v)
            | none => pure (texttt typeText, valText.map texttt)
          | none => pure (texttt typeText, valText.map texttt)
        return {
          names := h.names, type := typeText, typeLatex, val? := valText, valLatex?,
          isInserted? := h.isInserted?, isRemoved? := h.isRemoved? : HypLatex }

private def goalToLatex (r : Renderer) (g : InteractiveGoal) (diff? : Option DiffSets := none) :
    IO GoalLatex :=
  g.ctx.val.runMetaM {} do
    let decl ← g.mvarId.getDecl
    withLCtx decl.lctx decl.localInstances do
      let hyps ← hypsToLatex r decl.lctx g.hyps diff?
      let typeText := g.type.stripTags
      let typeLatex ← safeLatex r (← g.mvarId.getType) typeText (diff?.map fun d => { part := d.target, all := d.all, kind := d.kind })
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

/-- Adds a goal's target and hypothesis subterms (instantiated in its own context). -/
private def goalSubterms (g : InteractiveGoal) (acc : DiffSets) : IO DiffSets :=
  g.ctx.val.runMetaM {} do
    let decl ← g.mvarId.getDecl
    let target ← instantiateMVars decl.type
    let mut acc := { acc with
      target := collectSubterms target acc.target, all := collectSubterms target acc.all }
    for ldecl in decl.lctx do
      unless ldecl.isImplementationDetail do
        let key := hypKey ldecl.userName
        let ty ← instantiateMVars ldecl.type
        acc := { acc with
          hyps := acc.hyps.insert key (collectSubterms ty ((acc.hyps.get? key).getD {}))
          all := collectSubterms ty acc.all }
    return acc

/--
The goals at the start of the cursor's line (before its first tactic): "how the proof was before
this step". `none` if the cursor is already at (or before) that point.
-/
private def goalsBefore (p : GoalsLatexParams) :
    RequestM (RequestTask (Option (Array InteractiveGoal))) := do
  let text := (← RequestM.readDoc).meta.text
  let lineStart := text.lspPosToUtf8Pos { line := p.position.line, character := 0 }
  let lineEnd := text.lspPosToUtf8Pos { line := p.position.line + 1, character := 0 }
  -- Indentation is ASCII whitespace, so its length in characters is the LSP column.
  let line := String.Pos.Raw.extract text.source lineStart lineEnd
  let indent := line.takeWhile (· == ' ') |>.length
  if p.position.character ≤ indent || line.trimAscii.isEmpty then
    return ← RequestM.pureTask (pure none)
  let t ← FileWorker.getInteractiveGoals
    { textDocument := p.textDocument, position := { line := p.position.line, character := indent } }
  return t.mapCheap fun
    | .ok gs => .ok (gs.map (·.goals))
    | .error e => .error e

/--
Goals (tactic mode) and expected type (term mode) at a position, with LaTeX rendered from the
actual expressions, plus the goals before the tactic. `none` if there are no goals at all.
-/
@[server_rpc_method]
def getGoalsLatex (p : GoalsLatexParams) : RequestM (RequestTask (Option GoalsLatex)) := do
  let goalsTask ← FileWorker.getInteractiveGoals
    { textDocument := p.textDocument, position := p.position }
  let termTask ← FileWorker.getInteractiveTermGoal
    { textDocument := p.textDocument, position := p.position }
  let beforeTask ← goalsBefore p
  RequestM.bindTaskCostly goalsTask fun goals? => do
   RequestM.bindTaskCostly beforeTask fun before? => do
    RequestM.mapTaskCostly termTask fun term? => do
      let goals? ← match goals? with
        | .error e => throw e
        | .ok gs => pure gs
      -- The expected type and the previous state are bonuses: never fail because of them.
      let term? := match term? with
        | .error _ => none
        | .ok t => t
      let before? := match before? with
        | .error _ => none
        | .ok b => b
      if goals?.isNone && term?.isNone then return none
      let r : Renderer := {
        rules := p.rules, interactive := p.interactive,
        state := ← IO.mkRef { currentUri := p.textDocument.uri } }
      let current := goals?.map (·.goals) |>.getD #[]
      -- Before/after highlighting compares subterms of both states (interactive mode only).
      let (diffNew, diffOld) ← match before?, p.interactive with
        | some bs, true =>
          let beforeSets ← bs.foldlM (fun acc g => (goalSubterms g acc : IO _)) { kind := "new" }
          let afterSets ← current.foldlM (fun acc g => (goalSubterms g acc : IO _)) { kind := "old" }
          pure (some beforeSets, some afterSets)
        | _, _ => pure (none, none)
      let goals ← current.mapM fun g => (goalToLatex r g diffNew : IO _)
      let goalsBefore? ← before?.mapM (·.mapM fun g => (goalToLatex r g diffOld : IO _))
      let termGoal? ← match term? with
        | some t => some <$> (termGoalToLatex r t : IO _)
        | none => pure none
      return some { goals, termGoal?, goalsBefore?, subexprs := (← r.state.get).subexprs }

structure ExprsLatexParams where
  /-- Root `SubexprInfo.info` references of expressions embedded in messages. -/
  infos : Array (WithRpcRef Elab.InfoWithCtx)
  rules : Rules := {}
  interactive : Bool := false
  deriving RpcEncodable

structure ExprsLatex where
  version : Nat := protocolVersion
  /-- One entry per input reference; empty string if it is not an expression. -/
  latex : Array String
  subexprs : Array SubexprData := #[]
  deriving FromJson, ToJson

/--
Renders expressions from the infoview's references (used for expressions inside messages).

Runs in a dedicated task (`asTask`), not inline: user RPC methods are invoked from a
`(sync := true)` continuation, where rendering (which may wait for parallel elaboration) must
not block. Doing it inline made Lean report "`Task.get` called from a `(sync := true)` task".
-/
@[server_rpc_method]
def exprsLatex (p : ExprsLatexParams) : RequestM (RequestTask ExprsLatex) := do
  let uri := (← RequestM.readDoc).meta.uri
  RequestM.asTask do
    let r : Renderer := {
      rules := p.rules, interactive := p.interactive, state := ← IO.mkRef { currentUri := uri } }
    let latex ← p.infos.mapM fun i => do
      let i := i.val
      let e? := match i.info with
        | .ofTermInfo ti => some ti.expr
        | .ofDelabTermInfo { toTermInfo := ti, .. } => some ti.expr
        | _ => none
      match e? with
      | none => pure ""
      | some e => (i.ctx.runMetaM i.info.lctx (safeLatex r e "") : IO String)
    return { latex, subexprs := (← r.state.get).subexprs }

end LeanBlackboard
