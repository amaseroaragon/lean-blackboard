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
      /** Set when the RPC path failed and `plainGoal` was used instead. */
      fallbackReason?: string;
      /** `precise`: LaTeX from the companion Lean package; `fast`: converted from text here. */
      mode: ConversionMode;
    }
  | { kind: 'error'; location: string; message: string };

export type Notation = 'math' | 'lean';

export type ConversionMode = 'fast' | 'precise';

/** Display settings, sent separately from the goals so they apply without a new request. */
export interface ViewConfig {
  /** Global notation. Per-row overrides live in the webview and reset when this changes. */
  notation: Notation;
  /** KaTeX macros (`leanBlackboard.macros`), e.g. `{ "\\R": "\\mathbb{R}" }`. */
  macros: Record<string, string>;
}

export type HostMessage = { type: 'state'; state: PanelState } | { type: 'config'; config: ViewConfig };

export type WebviewMessage =
  | { type: 'ready' }
  /** Copy text to the clipboard (done by the host: more reliable than the webview clipboard). */
  | { type: 'copy'; text: string };
