// Follows the cursor in Lean editors and feeds the goals panel.
// Debounces updates, cancels the previous in-flight request and drops stale results.

import * as vscode from 'vscode';
import {
  PRECISE_METHOD,
  PreciseProtocolError,
  interactiveGoalsToView,
  plainGoalToView,
  preciseGoalsToView,
  rulesToWire,
} from '@lean-blackboard/core';
import type { GoalView } from '@lean-blackboard/core';
import { CancelledError, ERR_METHOD_NOT_FOUND, LeanBridge, Position, describeError, errorCode, ms } from './leanBridge';
import type { GoalsPanel } from './panel';
import type { Settings } from './settings';

const DEBOUNCE_MS = 150;
const MAX_JSON_CHARS = 8000;
/** After "method not found", retry precise mode for that file after this long (imports change). */
const PRECISE_RETRY_MS = 30_000;

export class GoalTracker implements vscode.Disposable {
  private debounceTimer: NodeJS.Timeout | undefined;
  private inFlight: vscode.CancellationTokenSource | undefined;
  /** Last Lean editor that had focus; kept while focus is on non-Lean editors or panels. */
  private leanEditor: vscode.TextEditor | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  /** Files where the companion package is not available → time of the last check. */
  private readonly noPrecise = new Map<string, number>();

  constructor(
    private readonly bridge: LeanBridge,
    private readonly panel: GoalsPanel,
    private readonly settings: Settings,
    private readonly log: vscode.LogOutputChannel,
  ) {
    const active = vscode.window.activeTextEditor;
    if (active && isLean(active.document)) this.leanEditor = active;

    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (!isLean(e.textEditor.document)) return;
        this.leanEditor = e.textEditor;
        this.schedule();
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && isLean(editor.document)) {
          this.leanEditor = editor;
          this.schedule();
        } else if (this.leanEditor && !vscode.window.visibleTextEditors.includes(this.leanEditor)) {
          // The Lean editor is gone (closed or replaced in its group).
          this.leanEditor = undefined;
          this.schedule();
        }
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document === this.leanEditor?.document) this.schedule();
      }),
      vscode.workspace.onDidCloseTextDocument((doc) => {
        if (doc === this.leanEditor?.document) {
          this.leanEditor = undefined;
          this.schedule();
        }
      }),
      this.bridge.onDidChangeState(() => this.schedule()),
      this.settings.onDidChangeRules(() => this.schedule()),
      vscode.workspace.onDidSaveTextDocument((doc) => this.noPrecise.delete(doc.uri.toString())),
      this.panel.onDidChangeVisibility((visible) => {
        if (visible) this.schedule();
      }),
    );
  }

  private schedule(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      void this.refresh();
    }, DEBOUNCE_MS);
  }

  private async refresh(): Promise<void> {
    // Nothing to do (and no requests to send) while nobody is looking.
    if (!this.panel.visible) return;

    const bridgeState = this.bridge.currentState;
    if (bridgeState !== 'ready') {
      this.panel.setState({ kind: bridgeState });
      return;
    }
    const editor = this.leanEditor;
    if (!editor) {
      this.cancelInFlight();
      this.panel.setState({ kind: 'noEditor' });
      return;
    }

    const cts = this.startRequest();
    const token = cts.token;
    const doc = editor.document;
    const pos = editor.selection.active;
    const position: Position = { line: pos.line, character: pos.character };
    const location = describeLocation(doc, pos);

    const t0 = performance.now();
    try {
      const precise = await this.tryPrecise(doc.uri, position, token);
      if (token.isCancellationRequested) return;
      if (precise !== undefined) {
        this.log.debug(`getGoalsLatex ${location} (${ms(t0)})`);
        this.panel.setState({ kind: 'goals', location, goals: precise, mode: 'precise' });
        return;
      }
      const res = await this.bridge.interactiveGoals(doc.uri, position, token);
      if (token.isCancellationRequested) return;
      this.log.debug(`getInteractiveGoals ${location} (${ms(t0)})`);
      this.panel.setState({
        kind: 'goals',
        location,
        goals: interactiveGoalsToView(res, this.settings.rules),
        mode: 'fast',
      });
      return;
    } catch (e) {
      if (e instanceof CancelledError || token.isCancellationRequested) return;
      const reason = describeError(e);
      this.log.warn(`getInteractiveGoals failed at ${location}: ${reason}. Falling back to plainGoal.`);
      try {
        const plain = await this.bridge.plainGoal(doc.uri, position, token);
        if (token.isCancellationRequested) return;
        this.panel.setState({
          kind: 'goals',
          location,
          goals: plainGoalToView(plain),
          fallbackReason: reason,
          mode: 'fast',
        });
      } catch (e2) {
        if (e2 instanceof CancelledError || token.isCancellationRequested) return;
        const msg = describeError(e2);
        this.log.error(`plainGoal failed at ${location}: ${msg}`);
        this.panel.setState({ kind: 'error', location, message: msg });
      }
    } finally {
      if (this.inFlight === cts) this.inFlight = undefined;
      cts.dispose();
    }
  }

  /**
   * Precise mode if enabled and available for this file. `undefined` means "use fast mode";
   * cancellation propagates as `CancelledError`.
   */
  private async tryPrecise(
    uri: vscode.Uri,
    position: Position,
    token: vscode.CancellationToken,
  ): Promise<GoalView[] | null | undefined> {
    if (this.settings.mode === 'fast') return undefined;
    const key = uri.toString();
    const checked = this.noPrecise.get(key);
    if (checked !== undefined && Date.now() - checked < PRECISE_RETRY_MS) return undefined;
    try {
      const rules = this.settings.rules;
      const res = await this.bridge.preciseGoals(uri, position, PRECISE_METHOD, rulesToWire(rules), token);
      this.noPrecise.delete(key);
      return preciseGoalsToView(res, rules);
    } catch (e) {
      if (e instanceof CancelledError) throw e;
      if (errorCode(e) === ERR_METHOD_NOT_FOUND) {
        if (checked === undefined) this.log.info(`Precise mode not available for ${vscode.workspace.asRelativePath(uri)} (companion package not imported); using fast mode.`);
      } else if (e instanceof PreciseProtocolError) {
        this.log.warn(`Precise mode disabled for this file: ${e.message}`);
      } else {
        this.log.warn(`Precise mode failed (${describeError(e)}); using fast mode.`);
      }
      this.noPrecise.set(key, Date.now());
      return undefined;
    }
  }

  private startRequest(): vscode.CancellationTokenSource {
    this.cancelInFlight();
    this.inFlight = new vscode.CancellationTokenSource();
    return this.inFlight;
  }

  private cancelInFlight(): void {
    this.inFlight?.cancel();
    this.inFlight = undefined;
  }

  /**
   * `Lean Blackboard: Dump Goals`: diagnostic dump of both raw responses with latencies.
   * Independent from the panel's request so it never cancels (or is cancelled by) it.
   */
  async dumpActive(): Promise<void> {
    this.log.show(true);
    const editor = vscode.window.activeTextEditor ?? this.leanEditor;
    if (!editor || !isLean(editor.document)) {
      this.log.info('Dump Goals: no active Lean editor.');
      return;
    }
    if (this.bridge.currentState !== 'ready') {
      this.log.info(`Dump Goals: Lean is not ready yet (state: ${this.bridge.currentState}).`);
      return;
    }
    const cts = new vscode.CancellationTokenSource();
    const doc = editor.document;
    const pos = editor.selection.active;
    const position: Position = { line: pos.line, character: pos.character };
    try {
      const [plain, interactive, precise] = await Promise.all([
        timed(() => this.bridge.plainGoal(doc.uri, position, cts.token)),
        timed(() => this.bridge.interactiveGoals(doc.uri, position, cts.token)),
        timed(() =>
          this.bridge.preciseGoals(doc.uri, position, PRECISE_METHOD, rulesToWire(this.settings.rules), cts.token),
        ),
      ]);
      const lines = [`── Goals at ${describeLocation(doc, pos)} ──`];
      lines.push(`plainGoal (${plain.latency}):`);
      if ('error' in plain) lines.push(`  ERROR ${plain.error}`);
      else if (plain.value === null) lines.push('  null');
      else lines.push(indent(String((plain.value as { rendered?: unknown }).rendered ?? JSON.stringify(plain.value))));
      lines.push(`getInteractiveGoals (${interactive.latency}):`);
      if ('error' in interactive) lines.push(`  ERROR ${interactive.error}`);
      else lines.push(indent(truncate(JSON.stringify(interactive.value, null, 2), MAX_JSON_CHARS)));
      lines.push(`${PRECISE_METHOD} (${precise.latency}):`);
      if ('error' in precise) lines.push(`  ERROR ${precise.error}`);
      else lines.push(indent(truncate(JSON.stringify(precise.value, null, 2), MAX_JSON_CHARS)));
      this.log.info(lines.join('\n'));
    } finally {
      cts.dispose();
    }
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.cancelInFlight();
    for (const d of this.disposables) d.dispose();
  }
}

function isLean(doc: vscode.TextDocument): boolean {
  return doc.languageId === 'lean4';
}

function describeLocation(doc: vscode.TextDocument, pos: vscode.Position): string {
  return `${vscode.workspace.asRelativePath(doc.uri)}:${pos.line + 1}:${pos.character + 1}`;
}

type Timed = { value: unknown; latency: string } | { error: string; latency: string };

async function timed(f: () => Promise<unknown>): Promise<Timed> {
  const t0 = performance.now();
  try {
    const value = await f();
    return { value, latency: ms(t0) };
  } catch (e) {
    return { error: e instanceof CancelledError ? 'cancelled' : describeError(e), latency: ms(t0) };
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}\n… (truncated, ${s.length - max} more chars)`;
}

function indent(s: string): string {
  return s
    .split('\n')
    .map((l) => `  ${l}`)
    .join('\n');
}
