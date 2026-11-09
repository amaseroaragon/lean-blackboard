import Lean
import LeanBlackboard.Name

/-!
# Definitions as equations

A `def` is shown as its signature (`f : ℕ → ℕ`) plus its defining equations, as one would write
them on a blackboard: one equation per pattern-matching case (`f(0) = 1`, `f(n + 1) = …`), with
the side conditions Lean adds for overlapping patterns (`… if x ≠ 0`).

The equations are Lean's own equation theorems (`f.eq_1`, …, from `getEqnsFor?`), so recursive
definitions read as their recursion and not as the compiled term (`Nat.brecOn`, `WellFounded.fix`).
-/

namespace LeanBlackboard

open Lean Meta Elab

structure EquationLatex where
  /-- Lean syntax. -/
  lean : String
  latex : String
  deriving FromJson, ToJson

structure DefinitionLatex where
  name : String
  nameLatex : String
  /-- Lean syntax. -/
  type : String
  typeLatex : String
  equations : Array EquationLatex
  deriving FromJson, ToJson

/-- Whether a command is (or contains, for `mutual`) a `def` or `abbrev`. -/
partial def isDefinitionCommand (stx : Syntax) : Bool :=
  match stx.getKind with
  | ``Lean.Parser.Command.declaration =>
    let k := stx[1].getKind
    k == ``Lean.Parser.Command.definition || k == ``Lean.Parser.Command.«abbrev»
  | ``Lean.Parser.Command.«mutual» => stx[1].getArgs.any isDefinitionCommand
  | _ => false

/-- Whether `c` is a user definition worth showing (not an instance, projection or auxiliary). -/
def isShownDefinition (c : Name) : MetaM Bool := do
  let env ← getEnv
  let some (.defnInfo _) := env.find? c | return false
  if c.isInternal || isAuxRecursor env c || isNoConfusion env c then return false
  if (← isProjectionFn c) || (← isInstance c) then return false
  return true

/--
The definitions of a command, in source order, each with the context to render it in (whose
environment is the one at the end of the command, so it contains them).
-/
def commandDefinitions (t : InfoTree) : Array (ContextInfo × Name) :=
  t.foldInfo (init := #[]) fun ctx i acc =>
    match i with
    | .ofTermInfo { isBinder := true, expr := .const c _, .. } =>
      if acc.any (·.2 == c) then acc
      else acc.push ({ ctx with env := ctx.cmdEnv?.getD ctx.env }, c)
    | _ => acc

/-- `Nat.succ (… (Nat.succ x))` as `(x, k)`. -/
partial def peelSucc (e : Expr) (k : Nat := 0) : Expr × Nat :=
  if e.isAppOfArity ``Nat.succ 1 then peelSucc e.appArg! (k + 1) else (e, k)

/--
Rewrites `Nat.succ^k n` as `n + k` and `p → False` as `¬p` (as the equation theorems state them).
-/
partial def normalizeEquation (e : Expr) : MetaM Expr := do
  return go (← instantiateMVars e)
where
  go (e : Expr) : Expr :=
    e.replace fun s =>
      if s.isAppOfArity ``Nat.succ 1 then
        let (x, k) := peelSucc s
        some (mkNatAdd (go x) (mkNatLit k))
      else match s with
        | .forallE _ p (.const ``False []) _ => some (mkNot (go p))
        | _ => none

/-- Gives the hygienic binders of an equation (`x✝`, from `| _ => …`) their plain names. -/
partial def cleanBinderNames : Expr → Expr
  | .forallE n t b bi => .forallE (if n.hasMacroScopes then n.eraseMacroScopes else n) t (cleanBinderNames b) bi
  | e => e

/-- The closed equations (`∀ xs, conds → f args = rhs`) of a definition. -/
def definitionEquations (c : Name) : MetaM (Array Expr) := do
  if let some eqs ← (try getEqnsFor? c catch _ => pure none) then
    if !eqs.isEmpty then
      return ← eqs.mapM fun eq => return cleanBinderNames (← getConstInfo eq).type
  -- Fallback: `f xs = body` from the value.
  let info ← getConstInfo c
  let some v := info.value? | return #[]
  let f := mkConst c (info.levelParams.map mkLevelParam)
  lambdaTelescope v fun xs b => do
    return #[← mkForallFVars xs (← mkEq (mkAppN f xs) b)]

/--
Renders a definition with `render e leanText` (which must never throw). Equations are stated
without their universally quantified variables; explicit hypotheses become `\text{if }` conditions.
-/
def definitionToLatex (c : Name) (render : Expr → String → MetaM String) :
    MetaM DefinitionLatex := do
  let info ← getConstInfo c
  let f := mkConst c (info.levelParams.map mkLevelParam)
  let type := toString (← ppExpr info.type)
  let equations ← (← definitionEquations c).mapM fun eq =>
    forallTelescope eq fun xs body => do
      let mut conds : Array Expr := #[]
      for x in xs do
        let d ← x.fvarId!.getDecl
        if d.binderInfo.isExplicit && (← isProp d.type) then
          conds := conds.push (← normalizeEquation d.type)
      let body ← normalizeEquation body
      let bodyText := toString (← ppExpr body)
      let mut latex ← render body bodyText
      let mut lean := bodyText
      unless conds.isEmpty do
        let condTexts ← conds.mapM fun p => return toString (← ppExpr p)
        let condLatex ← (conds.zip condTexts).mapM fun (p, t) => render p t
        latex := latex ++ " \\quad \\text{if } " ++ ",\\ ".intercalate condLatex.toList
        lean := lean ++ "  if " ++ ", ".intercalate condTexts.toList
      return { lean, latex : EquationLatex }
  return {
    name := c.toString, nameLatex := ← render f c.toString,
    type, typeLatex := ← render info.type type, equations }

end LeanBlackboard
