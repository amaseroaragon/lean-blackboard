import Lean

/-!
# Steps inside a `simp` lemma list

`simp only [a, b]` is a single tactic: Lean records no proof state between `a` and `b`. With the
cursor inside the list, the state "after the first `k` lemmas" is computed here by running the
tactic again, from the state before it, with only its first `k` list items (`simp only [a]`).

That is what each lemma adds, not a trace of what `simp` did: `simp` uses all its lemmas at once,
so a prefix can leave a term that the full list would have rewritten differently. For `simp_rw`,
which rewrites with its rules in order, the prefixes are its real intermediate states.
-/

namespace LeanBlackboard

open Lean Elab Server Widget

/--
Lemma lists `"[" items,* "]"` of simp-like tactics: an optional group of the tactic, or one of
the named lists. A list literal has the same shape but is a term of another kind.
-/
private def isLemmaList (stx : Syntax) : Bool :=
  stx.getNumArgs == 3 && stx[0].isToken "[" && stx[2].isToken "]" &&
    (stx.getKind == nullKind || stx.getKind == ``Parser.Tactic.simpArgs ||
      stx.getKind == ``Parser.Tactic.dsimpArgs || stx.getKind == ``Parser.Tactic.rwRuleSeq)

/-- `simp`, `simp?`, `simp_all`, `dsimp`, `simpa`, `simp_rw`, `field_simp`…, by their keyword. -/
private def isSimpLike (stx : Syntax) : Bool :=
  match stx[0] with
  | .atom _ val => (val.splitOn "simp").length > 1 || stx[0].isToken "norm_num" || stx[0].isToken "push_cast"
  | _ => false

/-- Whether `pos` is inside the brackets: after `[`, up to (and including) the position of `]`. -/
private def insideList (list : Syntax) (pos : String.Pos.Raw) : Bool :=
  match list[0].getPos? (canonicalOnly := true), list[2].getPos? (canonicalOnly := true) with
  | some l, some r => l < pos && pos ≤ r
  | _, _ => false

/--
The lemma list of `stx` containing `pos`, at most `depth` nodes down (`simpa` nests it in its
arguments), with the function that puts a new list back in its place.
-/
private def lemmaListAt (pos : String.Pos.Raw) : Nat → Syntax → Option (Syntax × (Syntax → Syntax))
  | depth, stx =>
    if isLemmaList stx then
      if insideList stx pos then some (stx, id) else none
    else match depth, stx with
      | depth + 1, .node info kind args =>
        (List.range args.size).findSome? fun i =>
          (lemmaListAt pos depth args[i]!).map fun (list, rebuild) =>
            (list, fun new => .node info kind (args.set! i (rebuild new)))
      | _, _ => none

/--
`simpa … using e` must close the goal, which its prefixes do not: they are shown as what `simp`
with the same arguments does to the goal (also for `simpa!`, without its extra unfolding).
-/
private def simpaToSimp (stx : Syntax) : Syntax :=
  let isRest (s : Syntax) :=
    s.getKind == ``Parser.Tactic.simpaArgsRest || s.getKind == ``Parser.Tactic.simpaUsingBangArgsRest
  match stx.getArgs.find? isRest with
  | some rest =>
    let list := match rest[3].getOptional? with
      | some args => mkNullNode args.getArgs
      | none => mkNullNode
    .node .none ``Parser.Tactic.simp
      #[mkAtomFrom stx[0] "simp", rest[0], rest[1], rest[2], list, mkNullNode]
  | none => stx

/-- A position inside the lemma list of a simp-like tactic. -/
structure SimpStep where
  /-- Number of list items that start before the position. -/
  applied : Nat
  /-- Number of list items. -/
  total : Nat
  /-- The tactic with only its first `k` list items. -/
  upTo : Nat → Syntax

def simpStepAt? (stx : Syntax) (pos : String.Pos.Raw) : Option SimpStep := do
  unless isSimpLike stx do none
  let (list, rebuild) ← lemmaListAt pos 3 stx
  let items := list[1].getSepArgs
  let applied := items.filter (fun item =>
    match item.getPos? (canonicalOnly := true) with
    | some start => start < pos
    | none => false) |>.size
  return {
    applied, total := items.size
    -- `k` items and the `k - 1` separators between them.
    upTo := fun k =>
      simpaToSimp (rebuild (list.setArg 1 (mkNullNode (list[1].getArgs.extract 0 (2 * k - 1))))) }

/-- The state before a tactic, as interactive goals. -/
def goalsBeforeTactic (ci : ContextInfo) (ti : TacticInfo) : IO (Array InteractiveGoal) :=
  { ci with mctx := ti.mctxBefore }.runMetaM {} (ti.goalsBefore.toArray.mapM goalToInteractive)

/-- "simp made no progress" and the like: the tactic leaves the state as it was. -/
private def isNoProgress (ex : Exception) : MetaM Bool := do
  let msg ← ex.toMessageData.toString
  return (msg.splitOn "no progress").length > 1 || (msg.splitOn "failed to simplify").length > 1

/--
The goals after running `tac` from the state before `ti`, in a throwaway copy of that state
(nothing is logged or added to the file). `none` if the tactic fails.
-/
def runTacticFrom (ci : ContextInfo) (ti : TacticInfo) (tac : Syntax) (cancelTk : IO.CancelToken) :
    IO (Option (Array InteractiveGoal)) := do
  try
    some <$> { ci with mctx := ti.mctxBefore }.runMetaM {} do
      withTheReader Core.Context ({ · with cancelTk? := some cancelTk }) do
        let run : Tactic.TacticM (List MVarId) := do
          Term.withSynthesize (Tactic.evalTactic tac)
          Tactic.getUnsolvedGoals
        let goals ←
          try
            Term.TermElabM.run' (ctx := { declName? := ci.parentDecl? }) <|
              (run { elaborator := .anonymous }).run' { goals := ti.goalsBefore }
          catch ex =>
            if ← isNoProgress ex then pure ti.goalsBefore else throw ex
        goals.toArray.mapM goalToInteractive
  catch _ => return none

/-- The proof states around the cursor's position in a simp lemma list. -/
structure SimpStepGoals where
  applied : Nat
  total : Nat
  /-- State with the first `applied` items; `none` when that is the whole list (the real state). -/
  goals? : Option (Array InteractiveGoal)
  /-- State with one item less; `none` when no item is applied yet. -/
  before? : Option (Array InteractiveGoal)

/--
With the position inside the lemma list of a simp-like tactic: the state with the items up to
the position, and the state without the last of them. `none` anywhere else, or if a prefix of the
list fails for another reason than making no progress.
-/
def simpStepGoals (position : Lsp.Position) : RequestM (RequestTask (Option SimpStepGoals)) := do
  let doc ← RequestM.readDoc
  let pos := doc.meta.text.lspPosToUtf8Pos position
  let cancelTk := (← read).cancelTk.cancelledByCancelRequest
  RequestM.mapTaskCostly (RequestM.findInfoTreeAtPos doc pos (includeStop := true)) fun tree? => do
    let some tree := tree? | return none
    -- One node per run of the tactic (`t <;> simp [a, b]` runs it on every goal). The goals at
    -- the cursor are not enough to find them: `simpa … using e` hides its node behind a nested one.
    let runs : Array (ContextInfo × TacticInfo × SimpStep) := tree.foldInfo (init := #[]) fun ci info runs =>
      match info with
      | .ofTacticInfo ti =>
        match simpStepAt? ti.stx pos with
        -- A macro (`simpa!`) and its expansion are the same run.
        | some step => if runs.any (·.2.1.goalsBefore == ti.goalsBefore) then runs else runs.push (ci, ti, step)
        | none => runs
      | _ => runs
    let some (_, _, step) := runs[0]? | return none
    let (applied, total) := (step.applied, step.total)
    if total == 0 then return none
    let stateWith (k : Nat) : IO (Option (Array InteractiveGoal)) := do
      let mut goals := #[]
      for (ci, ti, step) in runs do
        let gs? ←
          if k == 0 then some <$> goalsBeforeTactic ci ti
          else runTacticFrom ci ti (step.upTo k) cancelTk
        let some gs := gs? | return none
        goals := goals ++ gs
      return some goals
    let goals? ← if applied == total then pure none else stateWith applied
    if applied < total && goals?.isNone then return none
    let before? ← if applied == 0 then pure none else stateWith (applied - 1)
    if applied > 0 && before?.isNone then return none
    return some { applied, total, goals?, before? }

end LeanBlackboard
