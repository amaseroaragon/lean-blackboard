import Lean

/-!
LaTeX escaping and identifier rendering. Mirrors `packages/core/src/render/ident.ts` and
`texttt` in `packages/core/src/render/latex.ts` so that fast and precise mode look the same.
-/

namespace LeanBlackboard

/-- Escapes characters that are special in LaTeX math mode. -/
def escapeMath (s : String) : String :=
  s.foldl (init := "") fun acc c =>
    acc ++ match c with
      | '\\' => "\\backslash "
      | '^' => "\\hat{}"
      | '~' => "\\sim "
      | '{' | '}' | '#' | '$' | '%' | '&' | '_' => "\\" ++ c.toString
      | c => c.toString

private def isAsciiOrLetterOrDigit (c : Char) : Bool :=
  c.toNat < 128 || c.isAlphanum ||
    -- Non-ASCII letters (Greek, ℝ…): approximate `\p{L}` with "not a symbol block".
    (c.toNat ≥ 0x370 && c.toNat < 0x2000)

/-- `\texttt{…}` with text-mode escaping; Unicode symbols switch to math (KaTeX needs it). -/
def texttt (s : String) : String :=
  let collapsed := " ".intercalate (s.splitToList Char.isWhitespace |>.filter (!·.isEmpty))
  let body := collapsed.foldl (init := "") fun acc c =>
    acc ++ match c with
      | '\\' => "\\textbackslash{}"
      | '^' => "\\textasciicircum{}"
      | '~' => "\\textasciitilde{}"
      | '{' | '}' | '#' | '$' | '%' | '&' | '_' => "\\" ++ c.toString
      | c => if isAsciiOrLetterOrDigit c then c.toString else "$" ++ c.toString ++ "$"
  "\\texttt{" ++ body ++ "}"

private def greek : List (Char × String) :=
  [('α', "\\alpha"), ('β', "\\beta"), ('γ', "\\gamma"), ('δ', "\\delta"), ('ε', "\\varepsilon"),
   ('ζ', "\\zeta"), ('η', "\\eta"), ('θ', "\\theta"), ('ι', "\\iota"), ('κ', "\\kappa"),
   ('μ', "\\mu"), ('ν', "\\nu"), ('ξ', "\\xi"), ('π', "\\pi"), ('ρ', "\\rho"), ('σ', "\\sigma"),
   ('τ', "\\tau"), ('υ', "\\upsilon"), ('φ', "\\varphi"), ('χ', "\\chi"), ('ψ', "\\psi"),
   ('ω', "\\omega"), ('Γ', "\\Gamma"), ('Δ', "\\Delta"), ('Θ', "\\Theta"), ('Λ', "\\Lambda"),
   ('Ξ', "\\Xi"), ('Υ', "\\Upsilon"), ('Φ', "\\Phi"), ('Ψ', "\\Psi"), ('Ω', "\\Omega")]

private def subscripts : List (Char × Char) :=
  [('₀', '0'), ('₁', '1'), ('₂', '2'), ('₃', '3'), ('₄', '4'), ('₅', '5'), ('₆', '6'),
   ('₇', '7'), ('₈', '8'), ('₉', '9'), ('ₐ', 'a'), ('ₑ', 'e'), ('ₒ', 'o'), ('ₓ', 'x'),
   ('ₕ', 'h'), ('ₖ', 'k'), ('ₗ', 'l'), ('ₘ', 'm'), ('ₙ', 'n'), ('ₚ', 'p'), ('ₛ', 's'),
   ('ₜ', 't'), ('ᵢ', 'i'), ('ᵣ', 'r'), ('ᵤ', 'u'), ('ᵥ', 'v'), ('ⱼ', 'j')]

private def baseToLatex (base : String) (head : Bool) : String :=
  match base.toList with
  | [c] => (greek.lookup c).getD (escapeMath base)
  | _ => if head then s!"\\operatorname\{{escapeMath base}}" else s!"\\mathrm\{{escapeMath base}}"

/--
Renders an identifier: Greek letters, subscripts (`x₁`, `x_1`), primes and inaccessible names
(`inaccessible := true` adds a dagger, like `n✝` in the infoview). `head` marks a function
position, where multi-letter names use `\operatorname`.
-/
def identToLatex (name : String) (inaccessible := false) (head := false) : String := Id.run do
  let mut chars := name.toList
  -- Primes.
  let mut primes := ""
  while chars.getLast? == some '\'' do
    primes := primes ++ "'"
    chars := chars.dropLast
  -- Unicode subscripts (keep at least one base character).
  let mut sub : List Char := []
  while chars.length > 1 && (chars.getLast?.bind (subscripts.lookup ·)).isSome do
    sub := (subscripts.lookup chars.getLast!).get! :: sub
    chars := chars.dropLast
  let mut base := String.ofList chars
  -- ASCII subscript for a single-letter base: `x_1`.
  if sub.isEmpty then
    match chars with
    | c :: '_' :: rest@(_ :: _) =>
      if c.isAlpha && rest.all Char.isAlphanum then
        base := c.toString
        sub := rest
    | _ => pure ()
  let out := baseToLatex base head
    ++ (if sub.isEmpty then "" else s!"_\{{escapeMath (String.ofList sub)}}")
    ++ primes
    ++ (if inaccessible then "^{\\dagger}" else "")
  return if inaccessible then "{" ++ out ++ "}" else out

end LeanBlackboard
