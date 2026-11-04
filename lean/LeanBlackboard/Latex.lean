import Lean
import LeanBlackboard.Name

/-!
# `Expr` → LaTeX

A small, type-aware printer. It covers what the extension's text-based fast mode cannot know:

* `p → q` between propositions is `\Rightarrow`; between types it is `\to`.
* `a / b` is `\frac` in fields, `\lfloor a/b \rfloor` in `ℕ` and `\operatorname{div}` in `ℤ`.
* Bounded quantifiers (`∀ x, x > 0 → p`, `∃ x, x > 0 ∧ p`) print as `∀ x > 0, p`.
* Coercions (`@[coe]` functions) are invisible; implicit and instance arguments are hidden.

Function and symbol rules come from the client (default + user rules), with the same template
syntax as the fast mode: `#n` is an operand (parenthesised if needed), `{#n}` an operand in a
group slot (never parenthesised).

Anything unsupported falls back to `\texttt{<pretty-printed Lean>}` for that subterm only.
-/

namespace LeanBlackboard

open Lean Meta

def maxPrec : Nat := 1024
def argPrec : Nat := 1023

/-- Rendered LaTeX with the precedence of its outermost construct. -/
structure Tex where
  s : String
  prec : Nat := maxPrec
  /-- A negation `-a`: parenthesised when it is a right operand. -/
  isNeg : Bool := false
  /-- `s` without this term's own interactivity marker (for comparisons such as "is it `1`?"). -/
  raw : String := s
  deriving Inhabited

def Tex.paren (t : Tex) (p : Nat) : String :=
  if t.prec < p then s!"\\left({t.s}\\right)" else t.s

structure FunctionRule where
  name : String
  arity : Nat
  template : String
  deriving FromJson, ToJson, Inhabited

structure SymbolRule where
  name : String
  latex : String
  deriving FromJson, ToJson, Inhabited

structure Rules where
  symbols : Array SymbolRule := #[]
  functions : Array FunctionRule := #[]
  deriving FromJson, ToJson, Inhabited

/-- What a term is compared with for before/after highlighting. -/
structure DiffAgainst where
  /-- Subterms of the corresponding part of the other state (target, or same-name hypothesis). -/
  part : Std.HashSet Expr
  /-- Subterms of the whole other state: atoms that merely moved (e.g. `intro`) are not marked. -/
  all : Std.HashSet Expr
  /-- Marker value: `new` (after the tactic) or `old` (before it). -/
  kind : String

structure Ctx where
  symbols : Std.HashMap String String := {}
  functions : Std.HashMap String FunctionRule := {}
  /-- Wrap subterms in `\htmlData{lbid=N}{…}` and record them (interactive panel). -/
  markers : Bool := false
  /--
  Before/after highlighting: subterms of the *other* state, and the marker value (`new` for the
  state after a tactic, `old` for the state before it). Requires `markers`.
  -/
  diff? : Option DiffAgainst := none
  /-- Free variables of the goal's context (the only ones that can match the other state). -/
  goalFVars : Std.HashSet FVarId := {}

def Ctx.ofRules (r : Rules) (markers := false) : Ctx where
  symbols := r.symbols.foldl (fun m s => m.insert s.name s.latex) {}
  functions := r.functions.foldl (fun m f => m.insert f.name f) {}
  markers

/-- Where a constant is declared (LSP: 0-based lines). -/
structure DeclLocation where
  uri : String
  line : Nat
  character : Nat
  deriving FromJson, ToJson

/-- What the panel shows when hovering a marked subterm. -/
structure SubexprData where
  /-- The subterm as LaTeX (without markers) and as Lean text. -/
  latex : String
  expr : String
  /-- Its type as LaTeX and as Lean text. -/
  typeLatex : String
  type : String
  /-- Head constant, and where it is declared (for go-to-definition). -/
  const? : Option String := none
  location? : Option DeclLocation := none
  deriving FromJson, ToJson

/-- Upper bound on marked subterms per request, to bound the cost of computing their types. -/
def maxSubexprs : Nat := 400

structure LatexState where
  subexprs : Array SubexprData := #[]
  locations : Std.HashMap Name (Option DeclLocation) := {}
  /-- URI of the current document: constants declared in it have no module to look up. -/
  currentUri : String := ""

abbrev LatexM := ReaderT Ctx (StateRefT LatexState MetaM)

/--
Templates ending in a closing delimiter (`\sqrt{…}`, `\left|…\right|`, `\binom{…}{…}`) are
self-delimiting: no parentheses are needed when they are, e.g., the base of a power.
-/
def closesWithDelimiter (template : String) : Bool :=
  let t := template.trimAscii.toString
  let delimited := [")", "]", "|", "\\|", "\\rfloor", "\\rceil", "\\rangle"].any fun d =>
    t.endsWith ("\\right" ++ d) || (d.startsWith "\\r" && t.endsWith d)
  -- Or a single command whose braced arguments are the whole template (`\sqrt{#1}`,
  -- `\binom{#1}{#2}`); not `#2 X^{#1}`, which merely ends in a brace.
  let singleCommand := Id.run do
    let cs := t.toList
    let some ('\\', rest) := (cs.head?.map (·, cs.tail)) | return false
    let name := rest.takeWhile Char.isAlpha
    let mut groups := rest.drop name.length
    if name.isEmpty || groups.isEmpty then return false
    while !groups.isEmpty do
      let '{' :: more := groups | return false
      let body := more.takeWhile (fun c => c != '}' && c != '{')
      match more.drop body.length with
      | '}' :: after => groups := after
      | _ => return false
    return true
  delimited || singleCommand

/-- Removes `\htmlData{…}{` wrappers (keeping their contents). -/
partial def stripMarkers (s : String) : String := Id.run do
  let open_ := "\\htmlData{"
  let cs := s.toList.toArray
  let mut out := ""
  -- Depths at which a wrapper's content group closes.
  let mut closers : List Nat := []
  let mut depth := 0
  let mut i := 0
  while i < cs.size do
    if (String.ofList (cs[i:i + open_.length].toList)) == open_ then
      -- Skip `\htmlData{key=value}{`.
      let mut j := i + open_.length
      while j < cs.size && cs[j]! != '}' do j := j + 1
      i := j + 2
      depth := depth + 1
      closers := depth :: closers
      continue
    let c := cs[i]!
    if c == '\\' && i + 1 < cs.size then
      out := out.push c |>.push cs[i+1]!
      i := i + 2
      continue
    if c == '{' then depth := depth + 1
    if c == '}' then
      if closers.head? == some depth then
        closers := closers.tail
        depth := depth - 1
        i := i + 1
        continue
      depth := depth - 1
    out := out.push c
    i := i + 1
  return out

/-- `Set α` / `Finset α`: `≤`/`<` on them is inclusion. -/
def isSetType (t : Expr) : Bool :=
  t.isAppOf `Set || t.isAppOf `Finset

/-- Fills `#n` / `{#n}` placeholders (see module doc). -/
def fillTemplate (template : String) (args : Array Tex) : String := Id.run do
  let cs := template.toList.toArray
  let mut out := ""
  let mut i := 0
  while i < cs.size do
    let c := cs[i]!
    let digit (j : Nat) : Option Nat :=
      if h : j < cs.size then
        let d := cs[j]
        if d.isDigit then some (d.toNat - '0'.toNat) else none
      else none
    -- Group slot `{#n}`.
    if c == '{' && cs[i+1]? == some '#' && cs[i+3]? == some '}' then
      if let some n := digit (i+2) then
        if h : 0 < n ∧ n ≤ args.size then
          out := out ++ "{" ++ args[n-1].s ++ "}"
          i := i + 4
          continue
    if c == '#' then
      if let some n := digit (i+1) then
        if h : 0 < n ∧ n ≤ args.size then
          out := out ++ args[n-1].paren maxPrec
          i := i + 2
          continue
    out := out.push c
    i := i + 1
  return out

def atom (s : String) : Tex := { s }

/-- Coercions that `isCoeDecl` may not report, but that Lean prints as `↑`/`⇑`/`↥`. -/
def knownCasts : List Name :=
  [``Nat.cast, ``NatCast.natCast, `Int.cast, `IntCast.intCast, `Rat.cast, `RatCast.ratCast,
   -- Function and sort coercions (`⇑f x`, `↥s`) and subtype values (`↑x`).
   `DFunLike.coe, ``CoeFun.coe, ``CoeSort.coe, ``Subtype.val]

/-- `[a, b]` from `a :: b :: []`. -/
partial def listLiteral? (e : Expr) : Option (Array Expr) :=
  match e.getAppFn, e.getAppArgs with
  | .const ``List.nil _, #[_] => some #[]
  | .const ``List.cons _, #[_, h, t] => (listLiteral? t).map (#[h] ++ ·)
  | _, _ => none

/-- Constants the printer knows without client rules (client `symbols` take precedence). -/
def builtinSymbols : List (Name × String) :=
  [(``Nat, "\\mathbb{N}"), (``Int, "\\mathbb{Z}"), (`Rat, "\\mathbb{Q}"), (`Real, "\\mathbb{R}"),
   (`Complex, "\\mathbb{C}"), (``True, "\\mathrm{True}"), (``False, "\\mathrm{False}"),
   (`Real.pi, "\\pi")]

/-- Number sets and `Set`/`Finset`/`Fin`: binders over them read `x \in T`. -/
def isSetLike (t : Expr) : Bool :=
  match t.getAppFn with
  | .const c _ =>
    if t.getAppNumArgs == 0 then [``Nat, ``Int, `Rat, `Real, `Complex].contains c
    else [`Set, `Finset, ``Fin].contains c
  | _ => false

/-- Explicit arguments of an application, using the function's binder infos. -/
def explicitArgs (f : Expr) (args : Array Expr) : MetaM (Array Expr) := do
  let info ← getFunInfoNArgs f args.size
  let mut out := #[]
  for h : i in [0:args.size] do
    let explicit := match info.paramInfo[i]? with
      | some p => p.binderInfo.isExplicit
      | none => true
    if explicit then out := out.push args[i]
  return out

private def fvarLatex (id : FVarId) : MetaM String := do
  let n := (← id.getDecl).userName
  return identToLatex (n.eraseMacroScopes.toString (escape := false)) (inaccessible := n.hasMacroScopes)

/-- Relations allowed as binder predicates, with their LaTeX. -/
private def relation? (e : Expr) : Option (String × Expr × Expr) :=
  match e.getAppFn, e.getAppArgs with
  | .const ``LT.lt _, #[_, _, a, b] => some ("<", a, b)
  | .const ``LE.le _, #[_, _, a, b] => some ("\\leq", a, b)
  | .const ``GT.gt _, #[_, _, a, b] => some (">", a, b)
  | .const ``GE.ge _, #[_, _, a, b] => some ("\\geq", a, b)
  | .const ``Ne _, #[_, a, b] => some ("\\neq", a, b)
  | .const ``Membership.mem _, #[_, _, _, s, a] => some ("\\in", a, s)
  | .const ``HasSubset.Subset _, #[_, _, a, b] => some ("\\subseteq", a, b)
  | _, _ => none

/-- `x ∈ s` / `x > 0` where the left side is exactly `x`. -/
private def binderPred? (x : Expr) (e : Expr) : Option (String × Expr) :=
  match relation? e with
  | some (op, a, b) => if a == x && !b.containsFVar x.fvarId! then some (op, b) else none
  | none => none

mutual

partial def render (e : Expr) : LatexM Tex := do
  let t ← try renderCore e catch _ => fallback e
  let ctx ← read
  if !ctx.markers || !isMarkable e then return t
  -- Key-value pairs of the `\htmlData` marker: hover id and/or diff status.
  let mut keys : Array String := #[]
  if (← get).subexprs.size < maxSubexprs then
    if let some data ← (try some <$> subexprData e t catch _ => pure none) then
      keys := keys.push s!"lbid={(← get).subexprs.size}"
      modify fun st => { st with subexprs := st.subexprs.push data }
  if let some d := ctx.diff? then
    if isChanged ctx e d then keys := keys.push s!"lbdiff={d.kind}"
  if keys.isEmpty then return t
  return { t with s := s!"\\htmlData\{{", ".intercalate keys.toList}}\{{t.s}}", raw := t.s }

/--
A subterm counts as changed if it does not occur in the other state but its immediate parts do
(or it is atomic): this marks the smallest node that changed, e.g. `b * a` after
`rw [mul_comm]`, not the whole equation. Subterms under binders opened by the printer (whose free
variables are not in the goal's context) are never marked: they cannot match the other state.
-/
partial def isChanged (ctx : Ctx) (e : Expr) (d : DiffAgainst) : Bool :=
  let e := e.consumeMData
  if e.hasAnyFVar (fun f => !ctx.goalFVars.contains f) then false
  else if d.part.contains e then false
  else match e with
    | .app .. => (e.getAppFn :: e.getAppArgs.toList).all fun c => d.part.contains c.consumeMData
    | _ => !d.all.contains e

/--
Terms worth a hover: names and applications. Not binders, and not raw literals: they only occur
inside `OfNat.ofNat`, whose application carries the right type (`2 : ℝ`, not `2 : ℕ`).
-/
partial def isMarkable (e : Expr) : Bool :=
  match e.consumeMData with
  | .fvar .. | .const .. | .app .. => true
  | _ => false

partial def subexprData (e : Expr) (t : Tex) : LatexM SubexprData := do
  let ty ← instantiateMVars (← inferType e)
  -- The type is rendered without markers: hovering inside a hover is not supported.
  let tyT ← withReader ({ · with markers := false }) (render ty)
  let const? := e.getAppFn.consumeMData.constName?
  let location? ← match const? with
    | some c => declLocation c
    | none => pure none
  return {
    latex := stripMarkers t.s, expr := toString (← ppExpr e),
    typeLatex := tyT.s, type := toString (← ppExpr ty),
    const? := const?.map (·.toString), location? }

/-- Declaration site of a constant (cached per request). -/
partial def declLocation (c : Name) : LatexM (Option DeclLocation) := do
  if let some l := (← get).locations.get? c then return l
  let loc ← try
      let some ranges ← findDeclarationRanges? c | pure none
      let env ← getEnv
      let uri? ← match env.getModuleIdxFor? c with
        | some idx => Server.documentUriFromModule? (env.header.moduleNames[idx.toNat]!)
        | none => pure (some (← get).currentUri)
      pure <| uri?.map fun uri =>
        { uri, line := ranges.selectionRange.pos.line - 1,
          character := ranges.selectionRange.pos.column : DeclLocation }
    catch _ => pure none
  modify fun st => { st with locations := st.locations.insert c loc }
  return loc

partial def fallback (e : Expr) : LatexM Tex := do
  let fmt ← try ppExpr e catch _ => pure (format "?")
  return atom (texttt (toString fmt))

partial def renderCore (e : Expr) : LatexM Tex := do
  match e with
  | .mdata _ b => render b
  | .fvar id => return atom (← fvarLatex id)
  | .lit (.natVal n) => return atom (toString n)
  | .lit (.strVal s) => return atom (texttt s.quote)
  | .sort .zero => return atom "\\mathrm{Prop}"
  | .sort (.succ .zero) => return atom "\\mathrm{Type}"
  | .const c _ => return atom (constLatex (← read) c false)
  | .forallE .. => renderForall e
  | .lam .. => renderLam e
  | .app .. => renderApp e
  | _ => fallback e

partial def constLatex (ctx : Ctx) (c : Name) (head : Bool) : String :=
  let s := c.toString (escape := false)
  match ctx.symbols.get? s with
  | some l => l
  | none => (builtinSymbols.lookup c).getD (identToLatex s (head := head))

partial def binop (op : String) (p : Nat) (assoc : Ordering) (a b : Expr) : LatexM Tex := do
  let la ← render a
  let lb ← render b
  -- `assoc`: `.lt` left, `.gt` right, `.eq` none.
  let lp := if assoc == .lt then p else p + 1
  let rp := if assoc == .gt then p else p + 1
  let rhs := if lb.isNeg then s!"\\left({lb.s}\\right)" else lb.paren rp
  return { s := s!"{la.paren lp} {op} {rhs}", prec := p }

partial def renderApp (e : Expr) : LatexM Tex := do
  let f := e.getAppFn
  let args := e.getAppArgs
  if let .const c _ := f then
    if let some t ← renderKnown c args then return t
    -- Coercions are invisible: show the coerced value.
    if isCoeDecl (← getEnv) c || knownCasts.contains c then
      let ex ← explicitArgs f args
      -- `↑x`: just the value. `⇑g a b` (a coerced function applied, e.g. a linear map or a
      -- bundled hom): `g` applied to `a b`, using `g`'s rule if it has one.
      if ex.size == 1 then return ← render ex[0]!
      if h : 1 < ex.size then return ← renderCoeApp ex[0] ex[1:].toArray
    let explicit ← explicitArgs f args
    if let some rule := (← read).functions.get? (c.toString (escape := false)) then
      if rule.arity ≤ explicit.size then
        let applied := fillTemplate rule.template (← explicit[:rule.arity].toArray.mapM render)
        let rest := explicit[rule.arity:].toArray
        let prec := if closesWithDelimiter rule.template then maxPrec else argPrec
        if rest.isEmpty then return { s := applied, prec }
        return { s := applied ++ (← argList rest), prec := argPrec }
    if explicit.isEmpty then return atom (constLatex (← read) c false)
    return { s := constLatex (← read) c true ++ (← argList explicit), prec := maxPrec }
  let explicit ← explicitArgs f args
  let head ← render f
  if explicit.isEmpty then return head
  return { s := head.paren maxPrec ++ (← argList explicit), prec := maxPrec }

/-- `g` (a coerced function) applied to `rest`: merges with `g`'s own arguments for its rule. -/
partial def renderCoeApp (g : Expr) (rest : Array Expr) : LatexM Tex := do
  let gF := g.getAppFn
  if let .const c' _ := gF then
    if let some rule := (← read).functions.get? (c'.toString (escape := false)) then
      let all := (← explicitArgs gF g.getAppArgs) ++ rest
      if rule.arity ≤ all.size then
        let applied := fillTemplate rule.template (← all[:rule.arity].toArray.mapM render)
        let more := all[rule.arity:].toArray
        let prec := if closesWithDelimiter rule.template then maxPrec else argPrec
        if more.isEmpty then return { s := applied, prec }
        return { s := applied ++ (← argList more), prec := argPrec }
  let head ← render g
  return { s := head.paren maxPrec ++ (← argList rest), prec := maxPrec }

partial def argList (args : Array Expr) : LatexM String := do
  let parts ← args.mapM fun a => return (← render a).s
  return s!"\\left({", ".intercalate parts.toList}\\right)"

/-- Constants with dedicated notation. `none` means "not handled here". -/
partial def renderKnown (c : Name) (args : Array Expr) : LatexM (Option Tex) := do
  let n := args.size
  if c == ``List.cons || c == ``List.nil then
    if let some items := listLiteral? (mkAppN (.const c []) args) then
      let parts ← items.mapM fun i => return (← render i).s
      return some (atom s!"\\left[{", ".intercalate parts.toList}\\right]")
  match c, n with
  | ``Not, 1 =>
    let a := args[0]!
    if let some (op, x, y) := relation? a then
      if op == "\\in" then return some (← binop "\\notin" 50 .eq x y)
    match a.getAppFn, a.getAppArgs with
    | .const ``Eq _, #[_, x, y] => return some (← binop "\\neq" 50 .eq x y)
    | _, _ =>
      let t ← render a
      return some { s := s!"\\neg {t.paren maxPrec}", prec := maxPrec }
  | ``And, 2 => some <$> binop "\\land" 35 .gt args[0]! args[1]!
  | ``Or, 2 => some <$> binop "\\lor" 30 .gt args[0]! args[1]!
  | ``Iff, 2 => some <$> binop "\\iff" 20 .eq args[0]! args[1]!
  | ``Eq, 3 => some <$> binop "=" 50 .eq args[1]! args[2]!
  | ``Ne, 3 => some <$> binop "\\neq" 50 .eq args[1]! args[2]!
  -- On sets the order is inclusion (Mathlib elaborates `s ⊆ t` on `Set` as `s ≤ t`).
  | ``LT.lt, 4 => some <$> binop (if isSetType args[0]! then "\\subsetneq" else "<") 50 .eq args[2]! args[3]!
  | ``LE.le, 4 => some <$> binop (if isSetType args[0]! then "\\subseteq" else "\\leq") 50 .eq args[2]! args[3]!
  | ``GT.gt, 4 => some <$> binop (if isSetType args[0]! then "\\supsetneq" else ">") 50 .eq args[2]! args[3]!
  | ``GE.ge, 4 => some <$> binop (if isSetType args[0]! then "\\supseteq" else "\\geq") 50 .eq args[2]! args[3]!
  | ``EmptyCollection.emptyCollection, 2 => return some (atom "\\emptyset")
  | `Set.ofPred, 2 => renderSetOf args[0]! args[1]!
  | `setOf, 2 => renderSetOf args[0]! args[1]!
  | ``Membership.mem, 5 => some <$> binop "\\in" 50 .eq args[4]! args[3]!
  | ``HasSubset.Subset, 4 => some <$> binop "\\subseteq" 50 .eq args[2]! args[3]!
  | ``HasSSubset.SSubset, 4 => some <$> binop "\\subset" 50 .eq args[2]! args[3]!
  | ``Dvd.dvd, 4 => some <$> binop "\\mid" 50 .eq args[2]! args[3]!
  | ``Union.union, 4 => some <$> binop "\\cup" 65 .lt args[2]! args[3]!
  | ``Inter.inter, 4 => some <$> binop "\\cap" 70 .lt args[2]! args[3]!
  | ``SDiff.sdiff, 4 => some <$> binop "\\setminus" 70 .eq args[2]! args[3]!
  | ``HAdd.hAdd, 6 => some <$> binop "+" 65 .lt args[4]! args[5]!
  | ``HSub.hSub, 6 => some <$> binop "-" 65 .lt args[4]! args[5]!
  | ``HMul.hMul, 6 => some <$> binop "\\cdot" 70 .lt args[4]! args[5]!
  | ``HSMul.hSMul, 6 => some <$> binop "\\cdot" 73 .gt args[4]! args[5]!
  | ``HMod.hMod, 6 => some <$> binop "\\bmod" 70 .lt args[4]! args[5]!
  | ``HAppend.hAppend, 6 => some <$> binop "\\mathbin{+\\!\\!+}" 65 .lt args[4]! args[5]!
  | ``List.cons, 3 => some <$> binop "::" 67 .gt args[1]! args[2]!
  | ``Function.comp, 5 => some <$> binop "\\circ" 90 .gt args[3]! args[4]!
  | ``Prod, 2 => some <$> binop "\\times" 35 .gt args[0]! args[1]!
  | ``HDiv.hDiv, 6 =>
    let ty ← whnfR (← instantiateMVars args[2]!)
    let a ← render args[4]!
    let b ← render args[5]!
    if ty.isConstOf ``Nat then
      return some (atom s!"\\left\\lfloor \\frac\{{a.s}}\{{b.s}} \\right\\rfloor")
    if ty.isConstOf ``Int then
      return some (← binop "\\mathbin{\\operatorname{div}}" 70 .lt args[4]! args[5]!)
    return some (atom s!"\\frac\{{a.s}}\{{b.s}}")
  | ``HPow.hPow, 6 =>
    let base ← render args[4]!
    let exp ← render args[5]!
    return some { s := s!"{base.paren maxPrec}^\{{exp.s}}", prec := 75 }
  | ``Neg.neg, 3 =>
    let a ← render args[2]!
    return some { s := s!"-{a.paren 75}", prec := 75, isNeg := true }
  | ``Inv.inv, 3 =>
    let a ← render args[2]!
    return some { s := s!"{a.paren maxPrec}^\{-1}", prec := argPrec }
  | ``OfNat.ofNat, 3 => return some (← render args[1]!)
  | ``Nat.succ, 1 =>
    let a ← render args[0]!
    return some { s := s!"{a.paren 65} + 1", prec := 65 }
  | ``ite, 5 =>
    let cond ← render args[1]!
    let t ← render args[3]!
    let f ← render args[4]!
    return some (atom s!"\\begin\{cases} {t.s} & \\text\{if } {cond.s} \\\\ {f.s} & \\text\{otherwise} \\end\{cases}")
  | ``Exists, 2 => renderExists "\\exists" args[1]!
  -- Mathlib constants, matched by name (the package does not depend on Mathlib).
  | `ExistsUnique, 2 => renderExists "\\exists!" args[1]!
  | `Finset.sum, 5 => renderBigOp "\\sum" args[3]! args[4]!
  | `Finset.prod, 5 => renderBigOp "\\prod" args[3]! args[4]!
  | `Compl.compl, 3 =>
    let a ← render args[2]!
    return some { s := s!"{a.paren maxPrec}^\{\\complement}", prec := argPrec }
  | `deriv, 8 => renderDeriv args[6]! args[7]!
  | `intervalIntegral, 7 => renderIntegral args[3]! (some (args[4]!, args[5]!)) none
  | `MeasureTheory.integral, 7 =>
    -- `∫ x in s, f x` is `integral (volume.restrict s) f`.
    let μ := args[5]!
    let dom? := if μ.isAppOf `MeasureTheory.Measure.restrict then μ.getAppArgs.back? else none
    renderIntegral args[6]! none dom?
  | `Filter.Tendsto, 5 => renderLimit args[0]! args[2]! args[3]! args[4]!
  | _, _ => return none

/-- Runs `k` with the variable and body of `f` if it is a lambda, else with a fresh `x` and `f x`. -/
partial def withFunBody (f : Expr) (dflt : Name) (k : String → Expr → LatexM Tex) : LatexM Tex := do
  match f with
  | .lam n t b bi =>
    withLocalDecl (binderName n) bi t fun x => do k (← fvarLatex x.fvarId!) (b.instantiate1 x)
  | _ =>
    let ty ← whnf (← inferType f)
    let .forallE _ dom _ _ := ty | throwError "not a function"
    withLocalDeclD dflt dom fun x => do k (← fvarLatex x.fvarId!) (mkApp f x)

/-- `deriv (fun x => e) x` is `d/dx (e)`; at another point, evaluated with a bar. -/
partial def renderDeriv (f x : Expr) : LatexM (Option Tex) := do
  if !f.isLambda then
    let fT ← render f
    let xT ← render x
    return some { s := s!"{fT.paren maxPrec}'\\left({xT.s}\\right)", prec := maxPrec }
  let xT ← render x
  some <$> withFunBody f `x fun v body => do
    let b ← render body
    let d := s!"\\frac\{d}\{d{v}}\\left({b.s}\\right)"
    if xT.raw == v then return atom d
    return atom s!"\\left.{d}\\right|_\{{v} = {xT.s}}"

/-- `∫_a^b f x dx` (interval) or `∫_s f x dx` (restricted measure) or `∫ f x dx`. -/
partial def renderIntegral (f : Expr) (bounds? : Option (Expr × Expr)) (dom? : Option Expr) :
    LatexM (Option Tex) := do
  let limits ← match bounds?, dom? with
    | some (a, b), _ => pure s!"_\{{(← render a).s}}^\{{(← render b).s}}"
    | none, some s => pure s!"_\{{(← render s).s}}"
    | none, none => pure ""
  some <$> withFunBody f `x fun v body => do
    let b ← render body
    return { s := s!"\\int{limits} {b.paren 66} \\, d{v}", prec := 67 }

/-- `Tendsto f atTop (nhds l)` is `lim_{x → ∞} f x = l`; other filters are not handled. -/
partial def renderLimit (α f l₁ l₂ : Expr) : LatexM (Option Tex) := do
  let target? (l : Expr) : LatexM (Option String) := do
    if l.isAppOfArity `Filter.atTop 2 then return some "\\infty"
    if l.isAppOfArity `nhds 3 then return some (← render l.appArg!).s
    return none
  let some src ← target? l₁ | return none
  let some dst ← target? l₂ | return none
  let dflt := if α.isConstOf ``Nat then `n else `x
  some <$> withFunBody f dflt fun v body => do
    let b ← render body
    return { s := s!"\\lim_\{{v} \\to {src}} {b.s} = {dst}", prec := 50 }

/-- `{x ∈ T | p x}` (set-builder notation). -/
partial def renderSetOf (α p : Expr) : LatexM (Option Tex) := do
  let .lam n t b bi := p | return none
  withLocalDecl (binderName n) bi t fun x => do
    let name ← fvarLatex x.fvarId!
    let body ← render (b.instantiate1 x)
    let αT ← render α
    let ty := if isSetLike α then s!" \\in {αT.s}" else ""
    return some (atom s!"\\left\\\{ {name}{ty} \\mid {body.s} \\right\\}")

/-- `∃ x, p x`, with bounded form `∃ x > 0, q` for `∃ x, x > 0 ∧ q`. -/
partial def renderExists (q : String) (p : Expr) : LatexM (Option Tex) := do
  let .lam n t b bi := p | return none
  withLocalDecl (binderName n) bi t fun x => do
    let body := b.instantiate1 x
    let name ← fvarLatex x.fvarId!
    if let (.const ``And _, #[l, r]) := (body.getAppFn, body.getAppArgs) then
      if let some (op, rhs) := binderPred? x l then
        let rhsT ← render rhs
        let rest ← render r
        return some { s := s!"{q} {name} {op} {rhsT.s},\\ {rest.s}", prec := 0 }
    let tT ← render t
    let rest ← render body
    let ty := if isSetLike t then s!" \\in {tT.s}" else ""
    return some { s := s!"{q} {name}{ty},\\ {rest.s}", prec := 0 }

/-- `∑ i ∈ s, f i`; `Finset.range n` prints as `\sum_{i=0}^{n-1}`. -/
partial def renderBigOp (op : String) (s f : Expr) : LatexM (Option Tex) := do
  let .lam n t b bi := f | return none
  withLocalDecl (binderName n) bi t fun x => do
    let name ← fvarLatex x.fvarId!
    let body ← render (b.instantiate1 x)
    let bodyS := body.paren 70
    if let (.const `Finset.range _, #[m]) := (s.getAppFn, s.getAppArgs) then
      let upper ← match m.getAppFn, m.getAppArgs with
        | .const ``HAdd.hAdd _, #[_, _, _, _, k, one] =>
          if (← render one).raw == "1" then pure (← render k).s else pure s!"{(← render m).s} - 1"
        | _, _ => pure s!"{(← render m).paren 66} - 1"
      return some { s := s!"{op}_\{{name}=0}^\{{upper}} {bodyS}", prec := 67 }
    let sT ← render s
    return some { s := s!"{op}_\{{name} \\in {sT.s}} {bodyS}", prec := 67 }

partial def renderLam (e : Expr) : LatexM Tex := do
  lambdaTelescope e fun xs body => do
    let names ← xs.mapM fun x => fvarLatex x.fvarId!
    let b ← render body
    let params := if names.size == 1 then names[0]! else s!"\\left({", ".intercalate names.toList}\\right)"
    return { s := s!"{params} \\mapsto {b.s}", prec := 0 }

partial def renderForall (e : Expr) : LatexM Tex := do
  let .forallE n t b bi := e | fallback e
  let isPropE ← isProp e
  if bi.isInstImplicit then
    -- Instance arguments are implicit in ordinary mathematics.
    return ← withLocalDecl (binderName n) bi t fun x => render (b.instantiate1 x)
  if !b.hasLooseBVars then
    if isPropE && (← isProp t) then
      return ← binop "\\Rightarrow" 25 .gt t b
    return ← binop "\\to" 25 .gt t b
  if !isPropE then
    -- Dependent function type.
    return ← withLocalDecl (binderName n) bi t fun x => do
      let tT ← render t
      let body ← render (b.instantiate1 x)
      return { s := s!"\\left({← fvarLatex x.fvarId!} : {tT.s}\\right) \\to {body.paren 25}", prec := 25 }
  withLocalDecl (binderName n) bi t fun x => do
    let body := b.instantiate1 x
    let name ← fvarLatex x.fvarId!
    -- Bounded: `∀ x, x > 0 → p` is `∀ x > 0, p`.
    if let .forallE _ prem concl _ := body then
      if !concl.hasLooseBVars then
        if let some (op, rhs) := binderPred? x prem then
          let rhsT ← render rhs
          let rest ← render concl
          return { s := s!"\\forall {name} {op} {rhsT.s},\\ {rest.s}", prec := 0 }
    -- Merge `∀ x, ∀ y, …` over the same type into `∀ x, y ∈ T, …`.
    let tT ← render t
    let ty := if isSetLike t then s!" \\in {tT.s}" else s!" : {tT.s}"
    collectSameType t #[name] body fun names body => do
      let rest ← render body
      return { s := s!"\\forall {", ".intercalate names.toList}{ty},\\ {rest.s}", prec := 0 }

/--
Peels further dependent, explicit, unbounded `∀` binders whose type is exactly `t`, then calls
`k` inside their scope (the new free variables only exist there).
-/
partial def collectSameType (t : Expr) (names : Array String) (body : Expr)
    (k : Array String → Expr → LatexM Tex) : LatexM Tex := do
  match body with
  | .forallE n t' b bi =>
    if t' == t && b.hasLooseBVars && !bi.isInstImplicit && (← isProp body) then
      withLocalDecl (binderName n) bi t' fun y => do
        let inner := b.instantiate1 y
        -- Keep a bounded binder (`∀ y > 0, …`) separate.
        if let .forallE _ prem concl _ := inner then
          if !concl.hasLooseBVars && (binderPred? y prem).isSome then return ← k names body
        collectSameType t (names.push (← fvarLatex y.fvarId!)) inner k
    else k names body
  | _ => k names body

partial def binderName (n : Name) : Name :=
  if n.isAnonymous || n == `_ then `x else n

end

/-- Renders `e` (in the current local context) as LaTeX. Never throws. -/
def exprToLatex (e : Expr) (rules : Rules := {}) : MetaM String := do
  let e ← instantiateMVars e
  return (← ((render e).run (Ctx.ofRules rules)).run' {}).s

/--
Like `exprToLatex`, with interactivity markers: subterms are wrapped in `\htmlData{lbid=N}{…}`
where `N` indexes `LatexState.subexprs`. Thread the state through all calls of one response.
-/
def exprToLatexMarked (e : Expr) (rules : Rules) (diff? : Option DiffAgainst := none) :
    StateRefT LatexState MetaM String := do
  let e ← instantiateMVars e
  let goalFVars := (← getLCtx).foldl (fun s d => s.insert d.fvarId) {}
  return (← (render e).run { Ctx.ofRules rules (markers := true) with diff?, goalFVars }).s

/-- All subterms of `e` (for before/after comparison). -/
partial def collectSubterms (e : Expr) (acc : Std.HashSet Expr) : Std.HashSet Expr :=
  let e := e.consumeMData
  if acc.contains e then acc
  else
    let acc := acc.insert e
    match e with
    | .app f a => collectSubterms a (collectSubterms f acc)
    | .lam _ t b _ | .forallE _ t b _ => collectSubterms b (collectSubterms t acc)
    | .letE _ t v b _ => collectSubterms b (collectSubterms v (collectSubterms t acc))
    | .proj _ _ b => collectSubterms b acc
    | _ => acc

end LeanBlackboard
