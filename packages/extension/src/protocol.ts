// Messages and view models shared by the extension host and the webview.
// Must stay free of `vscode` and DOM imports: it is compiled into both bundles.

export interface HypView {
  names: string[];
  type: string;
  /** Value of a `let`-bound hypothesis (`x : T := v`). */
  val?: string;
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
      isInserted: boolean;
      isRemoved: boolean;
    }
  /** Fallback from `$/lean/plainGoal`: one pre-rendered goal. */
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
      /** Set when the RPC path failed and `plainGoal` was used instead. */
      fallbackReason?: string;
    }
  | { kind: 'error'; location: string; message: string };

export type HostMessage = { type: 'state'; state: PanelState };
export type WebviewMessage = { type: 'ready' };
