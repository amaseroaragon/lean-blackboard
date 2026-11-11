// Messages and view models shared by the extension host and the webview.
// Must stay free of `vscode` and DOM imports: it is compiled into both bundles.

export interface HypView {
  names: string[];
  /** Names as LaTeX (`h_{1}, h_{2}`). */
  namesLatex: string;
  /** Type in Lean syntax. */
  type: string;
  /** Type as LaTeX (may contain `\texttt{}` fallbacks, never empty). */
  typeLatex: string;
  /** Value of a `let`-bound hypothesis (`x : T := v`). */
  val?: string;
  valLatex?: string;
  isInserted: boolean;
  isRemoved: boolean;
}

export type GoalView =
  | {
      kind: 'structured';
      /** Case name (`case succ`), if any. */
      userName?: string;
      /** Usually `⊢ `. */
      prefix: string;
      hyps: HypView[];
      type: string;
      typeLatex: string;
      isInserted: boolean;
      isRemoved: boolean;
    }
  /** Fallback from `$/lean/plainGoal`: one pre-rendered goal, shown as Lean text. */
  | { kind: 'plain'; text: string };

/** One defining equation of a definition (`f(n + 1) = …`, maybe with an `if` condition). */
export interface EquationView {
  lean: string;
  latex: string;
}

/** A field of a `structure` or a constructor of an `inductive`: `name : type`. */
export interface MemberView {
  name: string;
  nameLatex: string;
  /** Type in Lean syntax. */
  type: string;
  typeLatex: string;
}

export type DefinitionKind = 'def' | 'structure' | 'inductive';

/**
 * A declaration of the command at the cursor (precise mode): signature plus the defining equations
 * (`def`/`abbrev`), the fields (`structure`) or the constructors (`inductive`).
 */
export interface DefinitionView {
  kind: DefinitionKind;
  name: string;
  nameLatex: string;
  /** Type in Lean syntax. */
  type: string;
  typeLatex: string;
  equations: EquationView[];
  members: MemberView[];
}

export type PanelState =
  | { kind: 'waiting' }
  | { kind: 'unavailable' }
  | { kind: 'noEditor' }
  | {
      kind: 'goals';
      /** `file:line:col`, for display. */
      location: string;
      /** `null`: no tactic state at the cursor. `[]`: no goals left. */
      goals: GoalView[] | null;
      /** Expected type of the term at the cursor (term mode), if any. */
      termGoal?: GoalView;
      /**
       * Goals at the start of the cursor's line ("before this step"), when the cursor is past it.
       * In precise mode, changed subterms are marked `lbdiff=old` here and `lbdiff=new` in `goals`.
       */
      goalsBefore?: GoalView[];
      /**
       * Precise mode only: the cursor is inside the lemma list of a simp-like tactic
       * (`simp only [a, b]`). `goals` is then the state after the tactic with only its first
       * `applied` list items (those before the cursor), and `goalsBefore` the state with one less.
       */
      simpStep?: SimpStepView;
      /** Precise mode only: the declarations of the `def`/`structure`/`inductive` command at the cursor. */
      definitions?: DefinitionView[];
      /** Errors, warnings and infos on the cursor's line. */
      messages?: MessageView[];
      /**
       * Precise mode only: data for the subterms marked `\\htmlData{lbid=N}{…}` in the LaTeX,
       * indexed by `N` (hover shows the type, Ctrl/Cmd+click goes to the definition).
       */
      subexprs?: SubexprView[];
      /** Set when the RPC path failed and `plainGoal` was used instead. */
      fallbackReason?: string;
      /** `precise`: LaTeX from the companion Lean package; `fast`: converted from text here. */
      mode: ConversionMode;
    }
  | { kind: 'error'; location: string; message: string };

export interface SimpStepView {
  applied: number;
  total: number;
}

export type Severity = 'error' | 'warning' | 'information' | 'hint';

export type MessagePart =
  | { kind: 'text'; text: string }
  /** An expression embedded in the message. */
  | { kind: 'expr'; latex: string; lean: string }
  /** A goal embedded in the message (e.g. "unsolved goals"). */
  | { kind: 'goal'; goal: GoalView };

export interface MessageView {
  severity: Severity;
  /** 0-based line where the message starts. */
  line: number;
  parts: MessagePart[];
}

export interface SubexprView {
  latex: string;
  expr: string;
  typeLatex: string;
  type: string;
  const?: string;
  /** Declaration site (LSP positions, 0-based). */
  location?: { uri: string; line: number; character: number };
}

export type Notation = 'math' | 'lean';

export type ConversionMode = 'fast' | 'precise';

/** Display settings, sent separately from the goals so they apply without a new request. */
export interface ViewConfig {
  /** Global notation. Per-row overrides live in the webview and reset when this changes. */
  notation: Notation;
  /** KaTeX macros (`leanBlackboard.macros`), e.g. `{ "\\R": "\\mathbb{R}" }`. */
  macros: Record<string, string>;
}

export type HostMessage =
  | { type: 'state'; state: PanelState }
  | { type: 'config'; config: ViewConfig }
  /** Pin the goals currently shown (command `Lean Blackboard: Pin Goal State`). */
  | { type: 'pin' };

export type WebviewMessage =
  | { type: 'ready' }
  /** Copy text to the clipboard (done by the host: more reliable than the webview clipboard). */
  | { type: 'copy'; text: string }
  /** Open a declaration (Ctrl/Cmd+click on a subterm). */
  | { type: 'goto'; uri: string; line: number; character: number }
  /** Reveal a position in the current Lean editor (click on a message). */
  | { type: 'reveal'; line: number };
