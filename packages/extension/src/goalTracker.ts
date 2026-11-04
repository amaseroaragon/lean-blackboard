// Follows the cursor in Lean editors and dumps the goals at that position to the log.
// Debounces cursor moves and cancels the previous in-flight request.

import * as vscode from 'vscode';
import { CancelledError, LeanBridge, Position, describeError, ms } from './leanBridge';

const DEBOUNCE_MS = 150;
const MAX_JSON_CHARS = 8000;

export class GoalTracker implements vscode.Disposable {
  private debounceTimer: NodeJS.Timeout | undefined;
  private inFlight: vscode.CancellationTokenSource | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly bridge: LeanBridge,
    private readonly log: vscode.LogOutputChannel,
  ) {
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor.document.languageId !== 'lean4') return;
        if (this.bridge.currentState !== 'ready') return;
        this.schedule(e.textEditor);
      }),
    );
  }

  private schedule(editor: vscode.TextEditor): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      void this.dump(editor.document, editor.selection.active);
    }, DEBOUNCE_MS);
  }

  /** On-demand dump for the active editor (command `Lean Blackboard: Dump Goals`). */
  async dumpActive(): Promise<void> {
    this.log.show(true);
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'lean4') {
      this.log.info('Dump Goals: no active Lean editor.');
      return;
    }
    if (this.bridge.currentState !== 'ready') {
      this.log.info(`Dump Goals: Lean is not ready yet (state: ${this.bridge.currentState}).`);
      return;
    }
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = undefined;
    await this.dump(editor.document, editor.selection.active);
  }

  private async dump(doc: vscode.TextDocument, pos: vscode.Position): Promise<void> {
    this.inFlight?.cancel();
    this.inFlight?.dispose();
    const cts = new vscode.CancellationTokenSource();
    this.inFlight = cts;
    const token = cts.token;

    const position: Position = { line: pos.line, character: pos.character };
    const [plain, interactive] = await Promise.all([
      timed(() => this.bridge.plainGoal(doc.uri, position, token)),
      timed(() => this.bridge.interactiveGoals(doc.uri, position, token)),
    ]);
    if (token.isCancellationRequested) return;
    if (this.inFlight === cts) this.inFlight = undefined;
    cts.dispose();

    const where = `${vscode.workspace.asRelativePath(doc.uri)}:${pos.line + 1}:${pos.character + 1}`;
    const lines = [`── Goals at ${where} ──`];

    lines.push(`plainGoal (${plain.latency}):`);
    if ('error' in plain) lines.push(`  ERROR ${plain.error}`);
    else if (plain.value === null) lines.push('  null');
    else lines.push(indent(String((plain.value as { rendered?: unknown }).rendered ?? JSON.stringify(plain.value))));

    lines.push(`getInteractiveGoals (${interactive.latency}):`);
    if ('error' in interactive) lines.push(`  ERROR ${interactive.error}`);
    else lines.push(indent(truncate(JSON.stringify(interactive.value, null, 2), MAX_JSON_CHARS)));

    this.log.info(lines.join('\n'));
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.inFlight?.cancel();
    this.inFlight?.dispose();
    for (const d of this.disposables) d.dispose();
  }
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
