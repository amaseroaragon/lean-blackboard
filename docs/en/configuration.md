# Configuration

**English** · [Español](../es/configuracion.md)

## Math / Lean notation

- **Global**: button in the title bar of the Goals panel, or the command
  `Lean Blackboard: Toggle Math / Lean Notation`. Remembered across sessions.
- **Per row**: hovering over a hypothesis or goal shows the `Lean`/`Math` and `Copy` buttons. The
  per-row choice is kept until you change the global notation (which resets it).
- `Copy` always copies the row's LaTeX (for example `\mathrm{hpq} : p \to q`).
- `Copy all` (next to the number of goals) or the command `Lean Blackboard: Copy Goal State as
  LaTeX` (icon in the panel's title bar) copy the whole state: one `\[ \begin{array}{l} …` block
  per goal, with the hypotheses above a rule and the goal below.

## Other panel features

- **Expected type**: inside a term (`exact foo _`, `fun x => …`) an *Expected type* section
  appears, as in the InfoView.
- **Long formulas**: if they do not fit the panel's width they are broken into lines at top-level
  operators (quantifiers, ⇒, ∨, ∧, relations, +). Recomputed when the width changes.
- **Interactivity (precise mode only)**: hovering over a subexpression highlights it and shows its
  type; Ctrl+click (⌘+click on macOS) opens its definition.
- **Before / After**: with the cursor after the first tactic of a line, the collapsible *Before*
  section shows the proof state at the start of that line (before the step), and the current state
  below it. Hidden if nothing changes. In precise mode the changing subexpression is highlighted:
  red in *Before* (what is about to change) and green in the current state (what is new). New or
  removed hypotheses are highlighted in both modes.
- **Messages**: errors, warnings and infos on the cursor's line, with expressions in math notation
  (in precise mode, rendered from the actual `Expr`) and embedded goals (for example, *unsolved
  goals*) shown as goals. Click a message's header to jump to its line.
- **Pinning a state**: `Pin` button next to the position, or the 📌 icon in the panel's title bar
  (command `Lean Blackboard: Pin Goal State`). The pinned state stays at the top while you move
  through the proof (up to 5; `Unpin` removes it). It survives hiding the panel.

## Custom rules: `leanBlackboard.customRules`

Merged with the default rules (yours win). Sections:

| Section | Key | Template |
|---|---|---|
| `symbols` | identifier (`G`, `Real.pi`) | LaTeX without parameters |
| `functions` | fully qualified name (`Real.sinh`) | with `#1`, `#2`… (arity = highest `#n`) |
| `infix` | infix operator the parser already knows (`→`, `+`, `∣`…) | `#1` and `#2` |
| `prefix` | `¬ - ↑ √ #`… | `#1` |
| `postfix` | `⁻¹ !` | `#1` |
| `binders` | `∀ ∃ ∃! ∑ ∏` | a command (`\forall`) |

`{#1}` (the placeholder wrapped in exactly one pair of braces) drops parentheses that only existed
in Lean: `\frac{#1}{#2}` turns `(a + b) / c` into `\frac{a + b}{c}`. Outside braces they are kept.

Example (`settings.json`):

```json
"leanBlackboard.customRules": {
  "symbols": { "G": "\\mathcal{G}" },
  "functions": {
    "Real.sinh": "\\sinh #1",
    "Nat.choose": "\\binom{#1}{#2}"
  },
  "infix": { "→": "#1 \\Rightarrow #2" }
}
```

Limitations: new operators cannot be added to the parser (for example `≡`); you can only change how
the ones it already recognises are drawn. Invalid entries are ignored with a warning in the
"Lean Blackboard" output channel.

## Macros: `leanBlackboard.macros`

Equivalent to `\newcommand` and passed to KaTeX. They can be used in custom rules.

```json
"leanBlackboard.macros": {
  "\\R": "\\mathbb{R}",
  "\\abs": "\\left|#1\\right|"
}
```

If a macro produces invalid LaTeX, that row is shown in Lean syntax.
